/**
 * Human demo for NodeJS: analyze every image in a folder and write annotated result images
 *
 * For each input image it writes:
 * - `<name>-result.jpg`: input with face mesh, iris, gaze, body skeleton, hands and objects drawn on top,
 *   a numbered label on every face and an info panel with per-face details below the image
 * - `report.json`: all detection results in a single file
 *
 * Faces are detected on the full image and again on padded, overlapping tiles, then merged.
 * This finds faces that are very large, tightly cropped or touching the image edge, which a single pass misses.
 *
 * Usage: node demo/nodejs/node-analyze.js <input-folder> <output-folder>
 * Requires native `@tensorflow/tfjs-node` and `canvas` (Node.js 22)
 */

const fs = require('fs');
const path = require('path');
const process = require('process');
const log = require('@vladmandic/pilogger'); // eslint-disable-line node/no-unpublished-require
require('@tensorflow/tfjs-node'); // eslint-disable-line node/no-unpublished-require
const canvas = require('canvas'); // eslint-disable-line node/no-unpublished-require
const Human = require('../../dist/human.node.js'); // use `require('@nimadorostkar/human')` when installed as a module

const faceConfig = {
  enabled: true,
  detector: { maxDetected: 30, minConfidence: 0.3, rotation: true },
  mesh: { enabled: true },
  iris: { enabled: true },
  description: { enabled: true },
  emotion: { enabled: true },
  antispoof: { enabled: true },
  liveness: { enabled: true },
};

const config = {
  debug: false,
  modelBasePath: 'file://models/',
  cacheSensitivity: 0,
  face: faceConfig,
  body: { enabled: true, maxDetected: 30, minConfidence: 0.2, modelPath: 'https://vladmandic.github.io/human-models/models/movenet-multipose.json' }, // multi-person pose model is not bundled locally
  hand: { enabled: true, maxDetected: 30, minConfidence: 0.6 },
  object: { enabled: true, maxDetected: 20, minConfidence: 0.4 },
  gesture: { enabled: true },
  segmentation: { enabled: false },
};

const faceOnlyConfig = { // separate instance for tile passes, since detect() merges any config overrides into the instance permanently
  debug: false,
  modelBasePath: 'file://models/',
  cacheSensitivity: 0,
  face: faceConfig,
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};

const extensions = ['.jpg', '.jpeg', '.png'];
const accent = '#ffb000';
const font = '"Helvetica Neue", Arial, sans-serif';
const tilePadding = 0.25; // fraction of tile size added as empty border on every side
const minTileScore = 0.5; // ignore weak detections from tile passes to avoid false positives
const deg = (rad) => Math.round((rad || 0) * 180 / Math.PI);
const pct = (val) => (typeof val === 'number' ? `${Math.round(100 * val)}%` : 'n/a');

function imageDataOf(source, width, height, sx = 0, sy = 0, padX = 0, padY = 0) {
  const c = new canvas.Canvas(width + 2 * padX, height + 2 * padY);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, sx, sy, width, height, padX, padY, width, height);
  return ctx.getImageData(0, 0, c.width, c.height);
}

function shiftFace(face, dx, dy, width, height) { // map face coordinates from a padded tile back to the original image
  const point = (p) => [p[0] + dx, p[1] + dy, p[2]];
  const box = [face.box[0] + dx, face.box[1] + dy, face.box[2], face.box[3]];
  const mesh = face.mesh.map(point);
  const annotations = {};
  for (const [key, points] of Object.entries(face.annotations)) annotations[key] = points.map(point);
  return {
    ...face,
    box,
    boxRaw: [box[0] / width, box[1] / height, box[2] / width, box[3] / height],
    mesh,
    meshRaw: mesh.map((p) => [p[0] / width, p[1] / height, face.meshRaw[0]?.[2] ?? 0]),
    annotations,
  };
}

function overlap(a, b) { // intersection over the smaller box, so a box that spans two faces is treated as a duplicate of both
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return (x * y) / Math.min(a[2] * a[3], b[2] * b[3]);
}

function mergeFaces(candidates) {
  const sorted = [...candidates].sort((a, b) => (Math.round(b.score * 20) - Math.round(a.score * 20)) || (a.box[2] * a.box[3] - b.box[2] * b.box[3]));
  const kept = [];
  for (const face of sorted) {
    if (!kept.some((k) => overlap(k.box, face.box) > 0.5)) kept.push(face);
  }
  kept.sort((a, b) => a.box[0] - b.box[0]); // number faces left to right
  return kept.map((face, id) => ({ ...face, id }));
}

async function detectFacesTiled(faceHuman, image, fullPassFaces) {
  const { width, height } = image;
  const tile = Math.min(width, height);
  const stride = Math.round(tile / 2);
  const offsets = [];
  const long = Math.max(width, height);
  for (let pos = 0; ; pos += stride) {
    offsets.push(Math.min(pos, long - tile));
    if (pos + tile >= long) break;
  }
  const candidates = [...fullPassFaces];
  for (const offset of offsets) {
    const [sx, sy] = width >= height ? [offset, 0] : [0, offset];
    const pad = Math.round(tile * tilePadding);
    const res = await faceHuman.detect(imageDataOf(image, tile, tile, sx, sy, pad, pad));
    for (const face of res.face) {
      if (face.score >= minTileScore) candidates.push(shiftFace(face, sx - pad, sy - pad, width, height));
    }
  }
  return mergeFaces(candidates);
}

function faceSummary(face) {
  const angle = face.rotation?.angle;
  const gaze = face.rotation?.gaze;
  return {
    id: face.id,
    confidence: face.score,
    age: Math.round(face.age || 0),
    gender: face.gender,
    genderScore: face.genderScore,
    emotion: face.emotion?.[0]?.emotion || 'n/a',
    emotions: (face.emotion || []).slice(0, 3).map((e) => ({ emotion: e.emotion, score: e.score })),
    real: face.real,
    live: face.live,
    head: angle ? { roll: deg(angle.roll), yaw: deg(angle.yaw), pitch: deg(angle.pitch) } : null,
    gaze: gaze ? { bearing: deg(gaze.bearing), strength: Math.round(100 * gaze.strength) } : null,
    box: face.box.map(Math.round),
  };
}

function wrap(ctx, text, maxWidth) { // wrap on the ' · ' separators first, then on spaces
  const parts = text.split('  ·  ');
  const lines = [];
  let line = '';
  for (const part of parts) {
    const next = line ? `${line}  ·  ${part}` : part;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = `      ${part}`;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function panelText(name, result, faces, objects, version) {
  const lines = [];
  lines.push({ text: `human v${version} by Nima Dorostkar  ·  ${name}  ·  ${result.width}x${result.height}`, title: true });
  lines.push({ text: `faces: ${faces.length}  ·  bodies: ${result.body.length}  ·  hands: ${result.hand.length}  ·  objects: ${objects.length}  ·  gestures: ${result.gesture.length}  ·  time: ${Math.round(result.performance.total || 0)} ms` });
  for (const f of faces) {
    const emotions = f.emotions.map((e) => `${e.emotion} ${pct(e.score)}`).join(', ');
    const head = f.head ? `head roll ${f.head.roll}°  yaw ${f.head.yaw}°  pitch ${f.head.pitch}°` : 'head n/a';
    const gaze = f.gaze ? `gaze ${f.gaze.bearing}° at ${f.gaze.strength}%` : 'gaze n/a';
    lines.push({ text: `#${f.id + 1}  ${f.gender} ${pct(f.genderScore)}  ·  age ~${f.age}  ·  ${emotions}  ·  real ${pct(f.real)}, live ${pct(f.live)}  ·  ${head}  ·  ${gaze}` });
  }
  if (objects.length) lines.push({ text: `objects: ${objects.map((o) => `${o.label} ${pct(o.score)}`).join(', ')}` });
  const gestures = [...new Set(result.gesture.map((g) => g.gesture))].slice(0, 12);
  if (gestures.length) lines.push({ text: `gestures: ${gestures.join('  ·  ')}` });
  return lines;
}

function drawBadge(ctx, box, text, size, imageWidth, imageHeight, placed) {
  ctx.font = `bold ${size}px ${font}`;
  const pad = Math.round(size * 0.35);
  const width = ctx.measureText(text).width + 2 * pad;
  const height = size + 2 * pad;
  const x = Math.round(Math.min(Math.max(0, box[0]), imageWidth - width)); // keep badge inside the image
  const spots = [box[1] - height - 2, box[1] + box[3] + 2, box[1] + 2]; // above the face, below it, or inside its top edge
  const fits = (top) => top >= 0 && top + height <= imageHeight;
  const free = (top) => !placed.some((p) => x < p.x + p.width && p.x < x + width && top < p.top + p.height && p.top < top + height);
  const top = Math.round(spots.find((s) => fits(s) && free(s)) ?? spots.find(fits) ?? 0);
  placed.push({ x, top, width, height });
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(x, top, width, height);
  ctx.fillStyle = accent;
  ctx.fillRect(x, top, Math.max(3, Math.round(size / 6)), height);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + pad, top + pad);
}

async function analyze(human, faceHuman, file, outDir) {
  const name = path.basename(file);
  const image = await canvas.loadImage(file);
  const result = await human.detect(imageDataOf(image, image.width, image.height));
  result.width = image.width;
  result.height = image.height;
  result.face = await detectFacesTiled(faceHuman, image, result.face);
  const objects = result.object.filter((o) => o.label !== 'person'); // people are already covered by face and body results
  result.hand = result.hand.filter((h) => !result.face.some((f) => overlap(f.box, h.box) > 0.5)); // hand detector can fire on faces in group photos
  result.body = result.body.filter((b) => !result.face.some((f) => overlap(f.box, b.box) > 0.6 && b.box[3] < f.box[3])); // drop spurious poses found inside close-up faces
  const faces = result.face.map(faceSummary);

  // scale fonts and lines to image size so results are readable on both small and large photos
  const scale = Math.max(image.width, image.height) / 1000;
  const fontSize = Math.max(13, Math.round(17 * scale));
  const lineHeight = Math.round(fontSize * 1.5);
  const margin = Math.round(fontSize * 0.8);
  const measure = new canvas.Canvas(10, 10).getContext('2d');
  const rows = [];
  for (const entry of panelText(name, result, faces, objects, human.version)) {
    measure.font = `${entry.title ? 'bold ' : ''}${fontSize}px ${font}`;
    for (const text of wrap(measure, entry.text, image.width - 2 * margin)) rows.push({ text, title: entry.title });
  }
  const panelHeight = Math.round(lineHeight * (rows.length + 1));

  const output = new canvas.Canvas(image.width, image.height + panelHeight);
  const ctx = output.getContext('2d');
  ctx.drawImage(image, 0, 0);
  await human.draw.all(output, { ...result, object: objects }, {
    font: `${Math.max(12, Math.round(14 * scale))}px ${font}`,
    lineHeight: Math.round(18 * scale),
    lineWidth: Math.max(2, Math.round(2 * scale)),
    pointSize: Math.max(1, Math.round(1.5 * scale)),
    color: 'rgba(0, 200, 255, 0.75)',
    labelColor: '#ffffff',
    drawPoints: true,
    drawPolygons: true,
    faceLabels: '', // faces get numbered badges and details in the info panel instead
    bodyLabels: '',
    bodyPartLabels: '',
    handLabels: '[label]',
    fingerLabels: '',
    gestureLabels: '',
  });
  const placed = [];
  for (const f of faces) {
    const gender = { male: 'M', female: 'F' }[f.gender] || '?';
    const size = Math.max(11, Math.min(Math.round(fontSize * 0.85), Math.round(f.box[2] * 0.2))); // smaller badges for small faces in group photos
    drawBadge(ctx, f.box, `#${f.id + 1}  ${gender} ${f.age}y  ${f.emotion}`, size, image.width, image.height, placed);
  }

  ctx.fillStyle = '#111317';
  ctx.fillRect(0, image.height, image.width, panelHeight);
  ctx.fillStyle = accent;
  ctx.fillRect(0, image.height, image.width, Math.max(2, Math.round(scale * 3)));
  ctx.textBaseline = 'top';
  rows.forEach((row, i) => {
    ctx.font = `${row.title ? 'bold ' : ''}${fontSize}px ${font}`;
    ctx.fillStyle = row.title ? accent : '#e8eaee';
    ctx.fillText(row.text, margin, image.height + Math.round(lineHeight * (i + 0.5)));
  });

  const outFile = path.join(outDir, `${path.parse(name).name}-result.jpg`);
  fs.writeFileSync(outFile, output.toBuffer('image/jpeg', { quality: 0.92 }));
  log.data('Analyzed', { input: name, faces: faces.length, bodies: result.body.length, hands: result.hand.length, objects: objects.length, output: outFile });
  return {
    image: name,
    size: [image.width, image.height],
    timeMs: Math.round(result.performance.total || 0),
    faces,
    bodies: result.body.map((b) => ({ id: b.id, score: b.score, box: b.box.map(Math.round), keypoints: b.keypoints.length })),
    hands: result.hand.map((h) => ({ id: h.id, label: h.label, score: h.score, box: h.box.map(Math.round) })),
    objects: objects.map((o) => ({ label: o.label, score: o.score, box: o.box.map(Math.round) })),
    gestures: [...new Set(result.gesture.map((g) => g.gesture))],
  };
}

async function main() {
  log.header();
  const [inDir, outDir] = process.argv.slice(2);
  if (!inDir || !outDir || !fs.existsSync(inDir)) {
    log.error('Usage: node demo/nodejs/node-analyze.js <input-folder> <output-folder>');
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  globalThis.Canvas = canvas.Canvas;
  globalThis.ImageData = canvas.ImageData;
  const human = new Human.Human(config);
  const faceHuman = new Human.Human(faceOnlyConfig);
  await Promise.all([human.load(), faceHuman.load()]);
  await human.warmup();
  log.info('Human:', human.version, 'backend:', human.tf.getBackend());

  const files = fs.readdirSync(inDir).filter((f) => extensions.includes(path.extname(f).toLowerCase())).sort();
  const report = [];
  for (const file of files) report.push(await analyze(human, faceHuman, path.join(inDir, file), outDir));
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  log.state('Done', { images: report.length, output: outDir });
}

main();
