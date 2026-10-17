/**
 * Human demo for NodeJS: analyze every frame of a video and write an annotated video plus a report
 *
 * Writes into the output folder:
 * - `<name>-result.mp4`: input video with face mesh, iris, gaze, body skeleton, hands and objects drawn on top,
 *   a badge on every face and a live info panel below the picture
 * - `<name>-report.json`: per-frame results and a summary of the whole clip
 *
 * Uses `ffmpeg` to split the video into frames and to encode the result, so it must be installed
 *
 * Usage: node demo/nodejs/node-analyze-video.js <input-video> <output-folder>
 * Requires native `@tensorflow/tfjs-node` and `canvas`
 */

const fs = require('fs');
const path = require('path');
const process = require('process');
const { execFileSync } = require('child_process');
const log = require('@vladmandic/pilogger'); // eslint-disable-line node/no-unpublished-require
require('@tensorflow/tfjs-node'); // eslint-disable-line node/no-unpublished-require
const canvas = require('canvas'); // eslint-disable-line node/no-unpublished-require
const Human = require('../../dist/human.node.js'); // use `require('@nimadorostkar/human')` when installed as a module

const config = {
  debug: false,
  modelBasePath: 'file://models/',
  face: {
    enabled: true,
    detector: { maxDetected: 5, minConfidence: 0.3, rotation: true },
    mesh: { enabled: true },
    iris: { enabled: true },
    description: { enabled: true },
    emotion: { enabled: true },
    antispoof: { enabled: true },
    liveness: { enabled: true },
  },
  body: { enabled: true, minConfidence: 0.2 },
  hand: { enabled: true, maxDetected: 2, minConfidence: 0.6 },
  object: { enabled: true, maxDetected: 10, minConfidence: 0.4 },
  gesture: { enabled: true },
  segmentation: { enabled: false },
};

const accent = '#ffb000';
const font = '"Helvetica Neue", Arial, sans-serif';
const panelRows = 5; // fixed panel height so every frame has the same size
const deg = (rad) => Math.round((rad || 0) * 180 / Math.PI);
const pct = (val) => (typeof val === 'number' ? `${Math.round(100 * val)}%` : 'n/a');
const even = (val) => 2 * Math.ceil(val / 2); // h.264 needs even dimensions
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round = (val, digits = 2) => (typeof val === 'number' ? Math.round(val * 10 ** digits) / 10 ** digits : null);

function overlap(a, b) { // intersection over the smaller box
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return (x * y) / Math.min(a[2] * a[3], b[2] * b[3]);
}

function faceSummary(face, id) {
  const angle = face.rotation?.angle;
  const gaze = face.rotation?.gaze;
  return {
    id,
    confidence: round(face.score),
    age: Math.round(face.age || 0),
    gender: face.gender,
    genderScore: round(face.genderScore),
    emotion: face.emotion?.[0]?.emotion || 'n/a',
    emotions: (face.emotion || []).slice(0, 3).map((e) => ({ emotion: e.emotion, score: round(e.score) })),
    real: round(face.real),
    live: round(face.live),
    head: angle ? { roll: deg(angle.roll), yaw: deg(angle.yaw), pitch: deg(angle.pitch) } : null,
    gaze: gaze ? { bearing: deg(gaze.bearing), strength: Math.round(100 * gaze.strength) } : null,
    box: face.box.map(Math.round),
  };
}

function panelText(name, time, frame, faces, result, objects, version) {
  const lines = [];
  lines.push({ text: `human v${version} by Nima Dorostkar  ·  ${name}  ·  ${time.toFixed(1)}s  ·  frame ${frame}`, title: true });
  lines.push({ text: `faces: ${faces.length}  ·  bodies: ${result.body.length}  ·  hands: ${result.hand.length}  ·  objects: ${objects.length}  ·  gestures: ${result.gesture.length}  ·  time: ${Math.round(result.performance.total || 0)} ms` });
  for (const f of faces) {
    const emotions = f.emotions.map((e) => `${e.emotion} ${pct(e.score)}`).join(', ');
    lines.push({ text: `#${f.id + 1}  ${f.gender} ${pct(f.genderScore)}  ·  age ~${f.age}  ·  ${emotions}  ·  real ${pct(f.real)}, live ${pct(f.live)}` });
    const head = f.head ? `head roll ${f.head.roll}°  yaw ${f.head.yaw}°  pitch ${f.head.pitch}°` : 'head n/a';
    const gaze = f.gaze ? `gaze ${f.gaze.bearing}° at ${f.gaze.strength}%` : 'gaze n/a';
    lines.push({ text: `      ${head}  ·  ${gaze}` });
  }
  if (objects.length) lines.push({ text: `objects: ${objects.map((o) => `${o.label} ${pct(o.score)}`).join(', ')}` });
  const gestures = [...new Set(result.gesture.map((g) => g.gesture))].slice(0, 8);
  lines.push({ text: `gestures: ${gestures.length ? gestures.join('  ·  ') : 'none'}` });
  return lines.slice(0, panelRows);
}

function drawBadge(ctx, box, text, size, imageWidth) {
  ctx.font = `bold ${size}px ${font}`;
  const pad = Math.round(size * 0.35);
  const width = ctx.measureText(text).width + 2 * pad;
  const height = size + 2 * pad;
  const x = Math.round(Math.min(Math.max(0, box[0]), imageWidth - width));
  const top = Math.round(box[1] - height - 2 >= 0 ? box[1] - height - 2 : box[1] + 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(x, top, width, height);
  ctx.fillStyle = accent;
  ctx.fillRect(x, top, Math.max(3, Math.round(size / 6)), height);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + pad, top + pad);
}

function summarize(frames, fps) {
  const faces = frames.flatMap((f) => f.faces.filter((face) => face.id === 0));
  const count = (values) => {
    const map = {};
    for (const v of values) map[v] = (map[v] || 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };
  const share = (entries, total) => Object.fromEntries(entries.map(([k, v]) => [k, pct(v / total)]));
  const ages = faces.map((f) => f.age).filter((a) => a > 0).sort((a, b) => a - b);
  const genders = count(faces.map((f) => f.gender));
  const yaw = faces.filter((f) => f.head).map((f) => f.head.yaw);
  const pitch = faces.filter((f) => f.head).map((f) => f.head.pitch);
  const gestureFrames = count(frames.flatMap((f) => f.gestures));
  return {
    frames: frames.length,
    duration: round(frames.length / fps, 1),
    framesWithFace: pct(faces.length / frames.length),
    framesWithBody: pct(frames.filter((f) => f.bodies > 0).length / frames.length),
    framesWithHands: pct(frames.filter((f) => f.hands.length > 0).length / frames.length),
    age: ages.length ? { median: ages[Math.floor(ages.length / 2)], min: ages[0], max: ages[ages.length - 1] } : null,
    gender: genders.length ? { value: genders[0][0], frames: pct(genders[0][1] / faces.length), avgScore: pct(avg(faces.filter((f) => f.gender === genders[0][0]).map((f) => f.genderScore))) } : null,
    emotion: share(count(faces.map((f) => f.emotion)), faces.length),
    real: pct(avg(faces.map((f) => f.real).filter((v) => typeof v === 'number'))),
    live: pct(avg(faces.map((f) => f.live).filter((v) => typeof v === 'number'))),
    head: yaw.length ? { yaw: [Math.min(...yaw), Math.max(...yaw)], pitch: [Math.min(...pitch), Math.max(...pitch)] } : null,
    gestures: share(gestureFrames, frames.length),
    objects: share(count(frames.flatMap((f) => [...new Set(f.objects.map((o) => o.label))])), frames.length),
    avgFrameMs: Math.round(avg(frames.map((f) => f.timeMs))),
  };
}

async function main() {
  log.header();
  const [input, outDir] = process.argv.slice(2);
  if (!input || !outDir || !fs.existsSync(input)) {
    log.error('Usage: node demo/nodejs/node-analyze-video.js <input-video> <output-folder>');
    process.exitCode = 1;
    return;
  }
  const name = path.parse(input).name;
  const framesIn = path.join(outDir, `${name}-frames-in`);
  const framesOut = path.join(outDir, `${name}-frames-out`);
  for (const dir of [framesIn, framesOut]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  const [num, den] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', input]).toString().trim().split('/').map(Number);
  const fps = num / (den || 1);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-vsync', '0', '-q:v', '2', path.join(framesIn, '%05d.jpg')]); // ffmpeg applies the phone's rotation metadata
  const files = fs.readdirSync(framesIn).filter((f) => f.endsWith('.jpg')).sort();
  log.info('Video:', { input, frames: files.length, fps });

  globalThis.Canvas = canvas.Canvas;
  globalThis.ImageData = canvas.ImageData;
  const human = new Human.Human(config);
  await human.load();
  await human.warmup();
  log.info('Human:', human.version, 'backend:', human.tf.getBackend());

  const frames = [];
  for (let i = 0; i < files.length; i++) {
    const image = await canvas.loadImage(path.join(framesIn, files[i]));
    const { width, height } = image;
    const src = new canvas.Canvas(width, height);
    src.getContext('2d').drawImage(image, 0, 0);
    const result = await human.detect(src.getContext('2d').getImageData(0, 0, width, height));
    const objects = result.object.filter((o) => o.label !== 'person'); // people are already covered by face and body results
    result.hand = result.hand.filter((h) => h.box.every(Number.isFinite) && !result.face.some((f) => overlap(f.box, h.box) > 0.5)); // drop hands found on faces
    const faces = [...result.face].sort((a, b) => a.box[0] - b.box[0]).map(faceSummary);

    const scale = Math.max(width, height) / 1000;
    const fontSize = Math.max(13, Math.round(17 * scale));
    const lineHeight = Math.round(fontSize * 1.5);
    const margin = Math.round(fontSize * 0.8);
    const panelHeight = even(lineHeight * (panelRows + 1));
    const output = new canvas.Canvas(even(width), even(height) + panelHeight);
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
      faceLabels: '',
      bodyLabels: '',
      bodyPartLabels: '',
      handLabels: '[label]',
      fingerLabels: '',
      gestureLabels: '',
    });
    for (const f of faces) {
      const gender = { male: 'M', female: 'F' }[f.gender] || '?';
      drawBadge(ctx, f.box, `#${f.id + 1}  ${gender} ${f.age}y  ${f.emotion}`, Math.round(fontSize * 0.95), width);
    }
    const top = even(height);
    ctx.fillStyle = '#111317';
    ctx.fillRect(0, top, output.width, panelHeight);
    ctx.fillStyle = accent;
    ctx.fillRect(0, top, output.width, Math.max(2, Math.round(scale * 3)));
    ctx.textBaseline = 'top';
    panelText(path.basename(input), i / fps, i + 1, faces, result, objects, human.version).forEach((row, r) => {
      ctx.font = `${row.title ? 'bold ' : ''}${fontSize}px ${font}`;
      ctx.fillStyle = row.title ? accent : '#e8eaee';
      ctx.fillText(row.text, margin, top + Math.round(lineHeight * (r + 0.5)), output.width - 2 * margin);
    });
    fs.writeFileSync(path.join(framesOut, files[i]), output.toBuffer('image/jpeg', { quality: 0.92 }));

    frames.push({
      frame: i + 1,
      time: round(i / fps),
      timeMs: Math.round(result.performance.total || 0),
      faces,
      bodies: result.body.length,
      hands: result.hand.map((h) => h.label),
      objects: objects.map((o) => ({ label: o.label, score: round(o.score) })),
      gestures: [...new Set(result.gesture.map((g) => g.gesture))],
    });
    if ((i + 1) % 30 === 0 || i === files.length - 1) log.data('Processed', { frame: i + 1, of: files.length, faces: faces.length, ms: frames[i].timeMs });
  }

  const video = path.join(outDir, `${name}-result.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(framesOut, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', video]);
  const summary = summarize(frames, fps);
  fs.writeFileSync(path.join(outDir, `${name}-report.json`), JSON.stringify({ input: path.basename(input), fps, summary, frames }, null, 2));
  fs.rmSync(framesIn, { recursive: true, force: true });
  fs.rmSync(framesOut, { recursive: true, force: true });
  log.state('Summary', summary);
  log.state('Done', { video, report: path.join(outDir, `${name}-report.json`) });
}

main();
