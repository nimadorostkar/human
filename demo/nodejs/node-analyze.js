/**
 * Human demo for NodeJS: analyze every image in a folder and write annotated result images
 *
 * For each input image it writes:
 * - `<name>-result.jpg`: input with face mesh, iris, gaze, body skeleton, hands and objects drawn on top,
 *   a numbered label on every face and an info panel with per-face details below the image
 * - `report.json`: all detection results in a single file
 *
 * Usage: node demo/nodejs/node-analyze.js <input-folder> <output-folder>
 * Requires native `@tensorflow/tfjs-node` and `canvas` (Node.js 22)
 */

const fs = require('fs');
const path = require('path');
const process = require('process');
const log = require('@vladmandic/pilogger'); // eslint-disable-line node/no-unpublished-require
const tf = require('@tensorflow/tfjs-node'); // eslint-disable-line node/no-unpublished-require, no-unused-vars
const canvas = require('canvas'); // eslint-disable-line node/no-unpublished-require
const Human = require('../../dist/human.node.js'); // use `require('@nimadorostkar/human')` when installed as a module

const config = {
  debug: false,
  modelBasePath: 'file://models/',
  cacheSensitivity: 0,
  face: {
    enabled: true,
    detector: { maxDetected: 30, minConfidence: 0.3, rotation: true },
    mesh: { enabled: true },
    iris: { enabled: true },
    description: { enabled: true },
    emotion: { enabled: true },
    antispoof: { enabled: true },
    liveness: { enabled: true },
  },
  body: { enabled: true, maxDetected: 30, minConfidence: 0.2, modelPath: 'https://vladmandic.github.io/human-models/models/movenet-multipose.json' }, // multi-person pose model is not bundled locally
  hand: { enabled: true, maxDetected: 30, minConfidence: 0.5 },
  object: { enabled: true, maxDetected: 20, minConfidence: 0.4 },
  gesture: { enabled: true },
  segmentation: { enabled: false },
};

const extensions = ['.jpg', '.jpeg', '.png'];
const accent = '#ffb000';
const deg = (rad) => Math.round((rad || 0) * 180 / Math.PI);
const pct = (val) => (typeof val === 'number' ? `${Math.round(100 * val)}%` : 'n/a');

function faceSummary(face) {
  const emotions = (face.emotion || []).slice(0, 3).map((e) => `${e.emotion} ${pct(e.score)}`).join(', ');
  const angle = face.rotation?.angle;
  const gaze = face.rotation?.gaze;
  return {
    id: face.id,
    confidence: face.score,
    age: Math.round(face.age || 0),
    gender: face.gender,
    genderScore: face.genderScore,
    emotion: face.emotion?.[0]?.emotion || 'n/a',
    emotions,
    real: face.real,
    live: face.live,
    distanceCm: face.distance ? Math.round(100 * face.distance) : null,
    head: angle ? { roll: deg(angle.roll), yaw: deg(angle.yaw), pitch: deg(angle.pitch) } : null,
    gaze: gaze ? { bearing: deg(gaze.bearing), strength: Math.round(100 * gaze.strength) } : null,
    box: face.box,
  };
}

function drawBadge(ctx, x, y, text, size) {
  ctx.font = `bold ${size}px "Helvetica Neue", Arial, sans-serif`;
  const pad = Math.round(size * 0.35);
  const width = ctx.measureText(text).width + 2 * pad;
  const height = size + 2 * pad;
  const top = Math.max(0, y - height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(x, top, width, height);
  ctx.fillStyle = accent;
  ctx.fillRect(x, top, Math.max(3, Math.round(size / 6)), height);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + pad, top + pad);
}

function panelLines(name, result, faces) {
  const lines = [];
  lines.push({ text: `human v${Human.Human ? new Human.Human().version : ''} · ${name} · ${result.width}x${result.height}`.replace('human v ·', 'human ·'), title: true });
  lines.push({ text: `faces: ${result.face.length}   bodies: ${result.body.length}   hands: ${result.hand.length}   objects: ${result.object.length}   gestures: ${result.gesture.length}   time: ${Math.round(result.performance.total || 0)} ms` });
  for (const f of faces) {
    const head = f.head ? `head roll ${f.head.roll}° yaw ${f.head.yaw}° pitch ${f.head.pitch}°` : '';
    const gaze = f.gaze ? `gaze ${f.gaze.bearing}° (${f.gaze.strength}%)` : '';
    lines.push({ text: `#${f.id + 1}  ${f.gender} ${pct(f.genderScore)}  ·  age ~${f.age}  ·  ${f.emotions}  ·  real ${pct(f.real)}  live ${pct(f.live)}  ·  ${head}  ·  ${gaze}` });
  }
  const objects = result.object.map((o) => `${o.label} ${pct(o.score)}`).join(', ');
  if (objects) lines.push({ text: `objects: ${objects}` });
  const gestures = [...new Set(result.gesture.map((g) => Object.values(g).filter((v) => typeof v === 'string').join(' ')))].slice(0, 12).join(' · ');
  if (gestures) lines.push({ text: `gestures: ${gestures}` });
  return lines;
}

async function analyze(human, file, outDir) {
  const name = path.basename(file);
  const image = await canvas.loadImage(file);
  const input = new canvas.Canvas(image.width, image.height);
  input.getContext('2d').drawImage(image, 0, 0);
  const imageData = input.getContext('2d').getImageData(0, 0, image.width, image.height);
  const result = await human.detect(imageData);
  result.width = image.width;
  result.height = image.height;
  const faces = result.face.map(faceSummary);

  // scale fonts and lines to image size so results are readable on both small and large photos
  const scale = Math.max(image.width, image.height) / 1000;
  const fontSize = Math.max(14, Math.round(18 * scale));
  const lines = panelLines(name, result, faces);
  const lineHeight = Math.round(fontSize * 1.55);
  const panelHeight = Math.round(lineHeight * (lines.length + 1));

  const output = new canvas.Canvas(image.width, image.height + panelHeight);
  const ctx = output.getContext('2d');
  ctx.drawImage(image, 0, 0);
  await human.draw.all(output, result, {
    font: `${Math.max(12, Math.round(14 * scale))}px "Helvetica Neue", Arial, sans-serif`,
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
  for (const f of faces) {
    const [x, y] = f.box;
    drawBadge(ctx, Math.max(0, x), Math.max(0, y - 2), `#${f.id + 1}  ${f.gender === 'male' ? 'M' : 'F'} ${f.age}y  ${f.emotion}`, Math.max(12, Math.round(fontSize * 0.85)));
  }

  ctx.fillStyle = '#111317';
  ctx.fillRect(0, image.height, image.width, panelHeight);
  ctx.fillStyle = accent;
  ctx.fillRect(0, image.height, image.width, Math.max(2, Math.round(scale * 3)));
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.font = `${line.title ? 'bold ' : ''}${fontSize}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = line.title ? accent : '#e8eaee';
    ctx.fillText(line.text, Math.round(fontSize * 0.8), image.height + Math.round(lineHeight * (i + 0.5)));
  });

  const outFile = path.join(outDir, `${path.parse(name).name}-result.jpg`);
  fs.writeFileSync(outFile, output.toBuffer('image/jpeg', { quality: 0.92 }));
  log.data('Analyzed', { input: name, faces: faces.length, bodies: result.body.length, hands: result.hand.length, objects: result.object.length, output: outFile });
  return {
    image: name,
    size: [image.width, image.height],
    timeMs: Math.round(result.performance.total || 0),
    faces,
    bodies: result.body.map((b) => ({ id: b.id, score: b.score, box: b.box, keypoints: b.keypoints.length })),
    hands: result.hand.map((h) => ({ id: h.id, label: h.label, score: h.score, box: h.box })),
    objects: result.object.map((o) => ({ label: o.label, score: o.score, box: o.box })),
    gestures: result.gesture,
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
  await human.load();
  await human.warmup();
  log.info('Human:', human.version, 'backend:', human.tf.getBackend());

  const files = fs.readdirSync(inDir).filter((f) => extensions.includes(path.extname(f).toLowerCase())).sort();
  const report = [];
  for (const file of files) report.push(await analyze(human, path.join(inDir, file), outDir));
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  log.state('Done', { images: report.length, output: outDir });
}

main();
