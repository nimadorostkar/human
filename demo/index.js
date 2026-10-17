/**
 * Human demo for browsers
 *
 * @description Main demo app that exposes all Human functionality
 *
 * @params Optional URL parameters:
 * image=<imagePath:string>: perform detection on specific image and finish
 * worker=<true|false>: use WebWorkers
 * backend=<webgl|wasm|cpu>: use specific TF backend for operations
 * preload=<true|false>: pre-load all configured models
 * warmup=<true|false>: warmup all configured models
 *
 * @example <https://wyse:10031/?backend=wasm&worker=true&image="/assets/sample-me.jpg">
 *
 * @configuration
 * userConfig={}: contains all model configuration used by human
 * drawOptions={}: contains all draw variables used by human.draw
 * ui={}: contains all variables exposed in the UI
 */

// WARNING!!!
// This demo is written using older code style and a lot of manual setup
// Newer versions of Human have richer functionality allowing for much cleaner & easier usage
// It is recommended to use other demos such as `demo/typescript` for usage examples

import { Human } from '../dist/human.esm.js'; // equivalent of '@nimadorostkar/human'
import Menu from './helpers/menu.js';
import GLBench from './helpers/gl-bench.js';
import webRTC from './helpers/webrtc.js';
import jsonView from './helpers/jsonview.js';

let human;

let userConfig = {
  // face: { enabled: false },
  // body: { enabled: false },
  // hand: { enabled: false },
  /*
  warmup: 'none',
  backend: 'webgl',
  debug: true,
  wasmPath: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@3.9.0/dist/',
  async: false,
  cacheSensitivity: 0.75,
  filter: { enabled: false, flip: false },
  face: { enabled: false,
    detector: { return: false, rotation: true },
    mesh: { enabled: false },
    iris: { enabled: false },
    description: { enabled: false },
    emotion: { enabled: false },
  },
  object: { enabled: false },
  gesture: { enabled: true },
  hand: { enabled: true, maxDetected: 1, minConfidence: 0.5, detector: { modelPath: 'handtrack.json' } },
  body: { enabled: false },
  // body: { enabled: true, modelPath: 'movenet-multipose.json' },
  segmentation: { enabled: false },
  */
  /*
  face: { iris: { enabled: false }, emotion: { enabled: false } },
  hand: { enabled: false },
  body: { enabled: false },
  gesture: { enabled: false },
  */
  face: { detector: { maxDetected: 10 } }, // library default is a single face, studio shows everyone in the frame
};

const drawOptions = {
  bufferedOutput: true, // makes draw functions interpolate results between each detection for smoother movement
  drawBoxes: true,
  drawGaze: true,
  drawLabels: true,
  drawGestures: false, // gesture list is opt-in from the overlay panel
  drawPolygons: true,
  drawPoints: false,
  fillPolygons: false,
  useCurves: false,
  useDepth: true,
  color: 'rgba(34, 211, 238, 0.7)', // cyan accent of the ui
  labelColor: '#f5f7ff',
  shadowColor: 'rgba(7, 8, 12, 0.85)',
  font: '600 15px ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif',
  lineHeight: 19,
  roundRect: 10,
  faceLabels: '[gender] [genderScore]%  ·  age [age]\n[emotions]', // compact labels; full details are in the results inspector
  bodyLabels: 'body [score]%',
  bodyPartLabels: '',
};

// ui options
const ui = {
  // configurable items
  console: true, // log messages to browser console
  crop: false, // video mode crop to size or leave full frame
  facing: true, // camera facing front or back
  baseBackground: '#07080c', // matches page background
  columns: 2, // when processing sample images create this many columns
  useWorker: false, // use web workers for processing
  worker: 'index-worker.js',
  maxFPSframes: 10, // keep fps history for how many frames
  modelsPreload: false, // preload human models on startup
  modelsWarmup: false, // warmup human models on startup
  buffered: true, // should output be buffered between frames
  interpolated: true, // should output be interpolated for smoothness between frames
  autoPlay: false, // start webcam & detection on load

  // internal variables
  exceptionHandler: true, // should capture all unhandled exceptions
  busy: false, // internal camera busy flag
  menuWidth: 0, // internal
  menuHeight: 0, // internal
  camera: {}, // internal, holds details of webcam details
  detectFPS: [], // internal, holds fps values for detection performance
  drawFPS: [], // internal, holds fps values for draw performance
  drawWarmup: false, // debug only, should warmup image processing be displayed on startup
  drawThread: null, // internl, perform draw operations in a separate thread
  detectThread: null, // internl, perform detect operations in a separate thread
  hintsThread: null, // internal, draw random hints
  framesDraw: 0, // internal, statistics on frames drawn
  framesDetect: 0, // internal, statistics on frames detected
  bench: true, // show gl fps benchmark window
  results: false, // show results tree
  lastFrame: 0, // time of last frame processing
  viewportSet: false, // internal, has custom viewport been set
  transferCanvas: null, // canvas used to transfer data to and from worker

  // webrtc
  useWebRTC: false, // use webrtc as camera source instead of local webcam
  webRTCServer: 'http://localhost:8002',
  webRTCStream: 'reowhite',

  // sample images
  compare: '../samples/ai-face.jpg', // base image for face compare
  samples: [],
};

const pwa = {
  enabled: true,
  cacheName: 'Human',
  scriptFile: 'index-pwa.js',
  cacheModels: true,
  cacheWASM: true,
  cacheOther: false,
};

// hints
const hints = [
  'Turn off models you do not need in Models for a big speed boost',
  'On a modern GPU the webgl backend is fastest; otherwise try wasm in Engine',
  'Drop images or videos anywhere on the page to analyze them',
  'Filters let you tune brightness, contrast and effects on the live input',
  'Enable Live face compare in Models to measure similarity to a baseline face',
  'Open the Results inspector in Overlay to browse raw detection data',
  'Everything runs locally in your browser; nothing is uploaded',
];

// global variables
const menu = {};
let worker;
let bench;
let lastDetectedResult = {};

function positionMenus() { // anchor each panel under its toolbar button; small screens use bottom sheets defined in css
  const top = `${document.getElementById('menubar').getBoundingClientRect().bottom + 10}px`;
  const anchors = { display: 'btnDisplay', image: 'btnImage', process: 'btnProcess', models: 'btnModel' };
  for (const [key, id] of Object.entries(anchors)) {
    const rect = document.getElementById(id).getBoundingClientRect();
    const width = menu[key].menu.offsetWidth || 330;
    menu[key].menu.style.top = top;
    menu[key].menu.style.left = `${Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12))}px`;
  }
}

function closeMenus(except) {
  for (const [key, m] of Object.entries(menu)) {
    if (key !== except) m.hide();
  }
  for (const btn of document.querySelectorAll('.nav-btn')) btn.classList.toggle('active', !!except && menu[except]?.visible() && btn.id === { display: 'btnDisplay', image: 'btnImage', process: 'btnProcess', models: 'btnModel' }[except]);
}

// helper function: async pause
// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// helper function: escapes text before it is placed into html
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// helper function: translates json to human readable string
function str(...msg) {
  if (!Array.isArray(msg)) return msg;
  let line = '';
  for (const entry of msg) {
    if (typeof entry === 'object') line += JSON.stringify(entry).replace(/{|}|"|\[|\]/g, '').replace(/,/g, ', ');
    else line += entry;
  }
  return line;
}

// helper function: wrapper around console output
function log(...msg) {
  const dt = new Date();
  const ts = `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}:${dt.getSeconds().toString().padStart(2, '0')}.${dt.getMilliseconds().toString().padStart(3, '0')}`;
  if (ui.console) console.log(ts, ...msg); // eslint-disable-line no-console
}

let prevStatus = '';
function status(msg) {
  const div = document.getElementById('status');
  if (div && msg && msg !== prevStatus && msg.length > 0) {
    log('status', msg);
    const ready = msg.includes('ready') || msg === 'paused';
    document.getElementById('play').style.display = 'none';
    document.getElementById('loader').style.display = ready ? 'none' : 'block';
    div.classList.toggle('ok', ready);
    div.innerText = msg.charAt(0).toUpperCase() + msg.slice(1);
    prevStatus = msg;
  } else {
    const video = document.getElementById('video');
    const playing = isLive(video) && !video.paused; // eslint-disable-line no-use-before-define
    document.getElementById('play').style.display = playing ? 'none' : 'block';
    document.getElementById('loader').style.display = 'none';
    div.innerText = '';
    prevStatus = '';
  }
}

async function videoPlay(videoElement = document.getElementById('video')) {
  document.getElementById('btnStartText').innerText = 'Pause';
  document.getElementById('btnStart').dataset.state = 'playing';
  document.body.classList.add('has-run');
  await videoElement.play();
}

async function videoPause() {
  document.getElementById('btnStartText').innerText = 'Start camera';
  document.getElementById('btnStart').dataset.state = 'paused';
  await document.getElementById('video').pause();
  status('paused');
  document.getElementById('play').style.display = 'block';
  document.getElementById('loader').style.display = 'none';
}

const compare = { enabled: false, original: null };
async function calcSimmilarity(result) {
  document.getElementById('compare-container').onclick = () => {
    log('resetting face compare baseline:');
    compare.original = null;
  };
  document.getElementById('compare-container').style.display = compare.enabled ? 'block' : 'none';
  if (!compare.enabled) {
    compare.original = null;
    return;
  }
  if (!result || !result.face || !result.face[0] || !result.face[0].embedding) return;
  if (!(result.face.length > 0) || (result.face[0].embedding.length <= 64)) return;
  if (!compare.original) {
    compare.original = result;
    log('setting face compare baseline:', result.face[0]);
    if (result.face[0].tensor) {
      const c = document.getElementById('orig');
      human.draw.tensor(result.face[0].tensor, c);
    } else {
      document.getElementById('compare-canvas').getContext('2d').drawImage(compare.original.canvas, 0, 0, 200, 200);
    }
  }
  const similarity = human.match.similarity(compare.original.face[0].embedding, result.face[0].embedding);
  document.getElementById('similarity').innerText = `similarity: ${Math.trunc(1000 * similarity) / 10}%`;
}

const isLive = (input) => {
  const isCamera = input.srcObject?.getVideoTracks()[0] && input.srcObject?.getVideoTracks()[0].enabled;
  const isVideoLive = input.readyState > 2;
  const isCameraLive = input.srcObject?.getVideoTracks()[0].readyState === 'live';
  let live = isCamera ? isCameraLive : isVideoLive;
  live = live && !input.paused;
  return live;
};

// draws processed results and starts processing of a next frame
let lastDraw = 0;
async function drawResults(input) {
  // await delay(25);
  const result = lastDetectedResult;
  const canvas = document.getElementById('canvas');

  // update draw fps data
  ui.drawFPS.push(1000 / (human.now() - lastDraw));
  if (ui.drawFPS.length > ui.maxFPSframes) ui.drawFPS.shift();
  lastDraw = human.now();

  // draw fps chart
  await menu.process.updateChart('FPS', ui.detectFPS);

  if (!result.canvas || ui.buffered) { // refresh with input if using buffered output or if missing canvas
    const image = await human.image(input, false);
    result.canvas = image.canvas;
    human.tf.dispose(image.tensor);
  }

  // draw image from video
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = ui.baseBackground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (result.canvas) {
    if (result.canvas.width !== canvas.width) canvas.width = result.canvas.width;
    if (result.canvas.height !== canvas.height) canvas.height = result.canvas.height;
    ctx.drawImage(result.canvas, 0, 0, result.canvas.width, result.canvas.height, 0, 0, result.canvas.width, result.canvas.height);
  } else {
    ctx.drawImage(input, 0, 0, input.width, input.height, 0, 0, canvas.width, canvas.height);
  }

  // draw all results using interpolated results
  let interpolated;
  if (ui.interpolated) interpolated = human.next(result);
  else interpolated = result;
  human.draw.all(canvas, interpolated, drawOptions);

  // show tree with results
  if (ui.results) {
    const div = document.getElementById('results');
    div.innerHTML = '';
    jsonView(result, div, 'Results', ['canvas', 'timestamp']);
  }

  /* alternatively use individual functions
  human.draw.face(canvas, result.face);
  human.draw.body(canvas, result.body);
  human.draw.hand(canvas, result.hand);
  human.draw.object(canvas, result.object);
  human.draw.gesture(canvas, result.gesture);
  */
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  const person = result.persons; // explicitly invoke person getter
  await calcSimmilarity(result);

  // update stats hud
  const engine = human.tf.engine();
  const avgDetect = ui.detectFPS.length > 0 ? Math.trunc(10 * ui.detectFPS.reduce((a, b) => a + b, 0) / ui.detectFPS.length) / 10 : 0;
  const avgDraw = ui.drawFPS.length > 0 ? Math.trunc(10 * ui.drawFPS.reduce((a, b) => a + b, 0) / ui.drawFPS.length) / 10 : 0;
  const backend = result.backend || human.tf.getBackend();
  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const gpuBytes = engine.backendInstance?.numBytesInGPU || 0;
  const stat = (label, value, cls = '') => `<span class="stat ${cls}">${esc(label)} <b>${esc(value)}</b></span>`;
  const stats = [];
  if (ui.camera.name) stats.push(stat(ui.camera.facing === 'back' ? 'Rear camera' : 'Camera', ui.camera.name.length > 28 ? `${ui.camera.name.slice(0, 26)}…` : ui.camera.name));
  if (result.canvas) stats.push(stat('Input', `${result.canvas.width}×${result.canvas.height}`));
  stats.push(stat('Backend', backend));
  if (avgDetect > 0) stats.push(stat('Detect', `${avgDetect} fps`, 'hot'));
  if (avgDraw > 0 && isLive(input)) stats.push(stat('Render', `${Math.round(avgDraw)} fps`));
  if (interpolated.performance?.total) stats.push(stat('Latency', `${Math.round(interpolated.performance.total)} ms`));
  stats.push(result.tensors ? stat('Tensors', `${result.tensors.toLocaleString()} in worker`) : stat('Tensors', engine.state.numTensors.toLocaleString()));
  if (!result.tensors) stats.push(stat('Memory', mb(engine.state.numBytes + gpuBytes)));
  stats.push(stat('Faces', (result.face || []).length), stat('Bodies', (result.body || []).length), stat('Hands', (result.hand || []).length));
  if ((ui.detectFPS.length > 5) && (avgDetect < 2)) stats.push('<span class="stat warn">Low performance: try another backend, a lower resolution, or fewer models</span>');
  stats.push(`<span class="stat stat-brand">human v${esc(human.version)}</span>`);
  const hud = document.getElementById('log');
  hud.innerHTML = stats.join('');
  hud.title = `performance: ${str(interpolated.performance)} ms`;
  ui.framesDraw++;
  ui.lastFrame = human.now();
  if (ui.buffered) {
    if (isLive(input)) {
      // ui.drawThread = requestAnimationFrame(() => drawResults(input));
      ui.drawThread = setTimeout(() => drawResults(input), 25);
    } else {
      cancelAnimationFrame(ui.drawThread);
      videoPause();
      ui.drawThread = null;
    }
  } else if (ui.drawThread) {
    log('stopping buffered refresh');
    cancelAnimationFrame(ui.drawThread);
    ui.drawThread = null;
  }
}

// setup webcam
let initialCameraAccess = true;
async function setupCamera() {
  if (ui.busy) return null;
  ui.busy = true;
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const output = document.getElementById('log');
  if (ui.useWebRTC) {
    status('setting up webrtc connection');
    try {
      video.onloadeddata = () => ui.camera = { name: ui.webRTCStream, width: video.videoWidth, height: video.videoHeight, facing: 'default' };
      await webRTC(ui.webRTCServer, ui.webRTCStream, video);
    } catch (err) {
      log(err);
    } finally {
      // status();
    }
    return '';
  }
  const live = video.srcObject ? ((video.srcObject.getVideoTracks()[0].readyState === 'live') && (video.readyState > 2) && (!video.paused)) : false;
  let msg = '';
  status('setting up camera');
  // setup webcam. note that navigator.mediaDevices requires that page is accessed via https
  if (!navigator.mediaDevices) {
    msg = 'camera access not supported';
    output.innerText += `\n${msg}`;
    log(msg);
    status(msg);
    ui.busy = false;
    return msg;
  }
  let stream;
  const constraints = {
    audio: false,
    video: {
      facingMode: ui.facing ? 'user' : 'environment',
      resizeMode: ui.crop ? 'crop-and-scale' : 'none',
      width: { ideal: document.body.clientWidth },
      // height: { ideal: document.body.clientHeight }, // not set as we're using aspectRation to get height instead
      aspectRatio: document.body.clientWidth / document.body.clientHeight,
      // deviceId: 'xxxx' // if you have multiple webcams, specify one to use explicitly
    },
  };
  // enumerate devices for diag purposes
  const devices = await navigator.mediaDevices.enumerateDevices();
  if (initialCameraAccess) log('enumerated input devices:', devices);
  // to select specific camera add deviceid from enumerated devices to camera constraints
  // constraints.video.deviceId = '6794499e046cf4aebf41cfeb7d1ef48a17bd65f72bafb55f3c0b06405d3d487b';
  if (initialCameraAccess) log('camera constraints', constraints);
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (err.name === 'PermissionDeniedError' || err.name === 'NotAllowedError') msg = 'camera permission denied';
    else if (err.name === 'SourceUnavailableError') msg = 'camera not available';
    else msg = `camera error: ${err.message || err}`;
    output.innerText += `\n${msg}`;
    status(msg);
    log('camera error:', err);
    ui.busy = false;
    return msg;
  }
  const tracks = stream.getVideoTracks();
  if (tracks && tracks.length >= 1) {
    if (initialCameraAccess) log('enumerated viable tracks:', tracks);
  } else {
    ui.busy = false;
    return 'no camera track';
  }
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  if (initialCameraAccess) log('selected video source:', track, settings);
  ui.camera = { name: track.label.toLowerCase(), width: settings.width, height: settings.height, facing: settings.facingMode === 'user' ? 'front' : 'back' };
  initialCameraAccess = false;

  if (!stream) return 'camera stream empty';

  const ready = new Promise((resolve) => { (video.onloadeddata = () => resolve(true)); });
  video.srcObject = stream;
  await ready;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ui.menuWidth.setValue(video.videoWidth);
  ui.menuHeight.setValue(video.videoHeight);
  if (live || ui.autoPlay) await videoPlay();
  if ((live || ui.autoPlay) && !ui.detectThread) runHumanDetect(video, canvas); // eslint-disable-line no-use-before-define
  return 'camera stream ready';
}

function initPerfMonitor() {
  if (!bench) {
    const gl = null;
    // cosnt gl = human.tf.engine().backend.gpgpu.gl;
    // if (!gl) log('bench cannot get tensorflow webgl context');
    bench = new GLBench(gl, {
      trackGPU: false, // this is really slow
      chartHz: 20,
      chartLen: 20,
    });
    bench.begin();
  }
}

// wrapper for worker.postmessage that creates worker if one does not exist
function webWorker(input, image, canvas, timestamp) {
  if (!worker) {
    // create new webworker and add event handler only once
    log('creating worker thread');
    // load Human using IIFE script as Chome Mobile does not support Modules as Workers
    // worker = new Worker(ui.worker, { type: 'module' });
    worker = new Worker(ui.worker);
    // after receiving message from webworker, parse&draw results and send new frame for processing
    worker.addEventListener('message', (msg) => {
      status();
      if (msg.data.result.performance && msg.data.result.performance.total) ui.detectFPS.push(1000 / msg.data.result.performance.total);
      if (ui.detectFPS.length > ui.maxFPSframes) ui.detectFPS.shift();
      if (ui.bench) {
        if (!bench) initPerfMonitor();
        bench.nextFrame(timestamp);
      }
      if (document.getElementById('gl-bench')) document.getElementById('gl-bench').style.display = ui.bench ? 'block' : 'none';
      lastDetectedResult = msg.data.result;

      if (msg.data.image) { // we dont really need canvas since we draw from video
        /*
        if (!lastDetectedResult.canvas || lastDetectedResult.canvas.width !== msg.data.width || lastDetectedResult.canvas.height !== msg.data.height) {
          lastDetectedResult.canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(msg.data.width, msg.data.height) : document.createElement('canvas');
          lastDetectedResult.canvas.width = msg.data.width;
          lastDetectedResult.canvas.height = msg.data.height;
        }
        const ctx = lastDetectedResult.canvas.getContext('2d');
        const imageData = new ImageData(new Uint8ClampedArray(msg.data.image), msg.data.width, msg.data.height);
        ctx.putImageData(imageData, 0, 0);
        */
      }

      ui.framesDetect++;
      if (!ui.drawThread) drawResults(input);
      if (isLive(input)) {
        ui.detectThread = requestAnimationFrame((now) => runHumanDetect(input, canvas, now)); // eslint-disable-line no-use-before-define
      }
    });
  }
  // pass image data as arraybuffer to worker by reference to avoid copy
  worker.postMessage({ image: image.data.buffer, width: canvas.width, height: canvas.height, userConfig }, [image.data.buffer]);
}

// main processing function when input is webcam, can use direct invocation or web worker
function runHumanDetect(input, canvas, timestamp) {
  // if live video
  if (!isLive(input)) {
    // stop ui refresh
    // if (ui.drawThread) cancelAnimationFrame(ui.drawThread);
    if (ui.detectThread) cancelAnimationFrame(ui.detectThread);
    if (input.paused) log('video paused');
    // if we want to continue and camera not ready, retry in 0.5sec, else just give up
    // else if (cameraLive && (input.readyState <= 2)) setTimeout(() => runHumanDetect(input, canvas), 500);
    else log(`video not ready: track state: ${input.srcObject ? input.srcObject.getVideoTracks()[0].readyState : 'unknown'} stream state: ${input.readyState}`);
    log('frame statistics: process:', ui.framesDetect, 'refresh:', ui.framesDraw);
    log('memory', human.tf.engine().memory());
    return;
  }
  if (ui.hintsThread) clearInterval(ui.hintsThread);
  if (ui.useWorker && human.env.offscreen) {
    // get image data from video as we cannot send html objects to webworker
    if (!ui.transferCanvas || ui.transferCanvas.width !== canvas.width || ui.transferCanvas.height || canvas.height) {
      ui.transferCanvas = document.createElement('canvas');
      ui.transferCanvas.width = canvas.width;
      ui.transferCanvas.height = canvas.height;
    }
    const ctx = ui.transferCanvas.getContext('2d');
    ctx.drawImage(input, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // perform detection in worker
    webWorker(input, data, canvas, timestamp);
  } else {
    human.detect(input, userConfig)
      .then((result) => {
        status();
        if (result.performance && result.performance.total) ui.detectFPS.push(1000 / result.performance.total);
        if (ui.detectFPS.length > ui.maxFPSframes) ui.detectFPS.shift();
        if (ui.bench) {
          if (!bench) initPerfMonitor();
          bench.nextFrame(timestamp);
        }
        if (document.getElementById('gl-bench')) document.getElementById('gl-bench').style.display = ui.bench ? 'block' : 'none';
        if (result.error) {
          log(result.error);
          document.getElementById('log').insertAdjacentHTML('afterbegin', `<span class="stat err">Error: ${esc(result.error)}</span>`);
        } else {
          lastDetectedResult = result;
          if (!ui.drawThread) drawResults(input);
          ui.framesDetect++;
          ui.detectThread = requestAnimationFrame((now) => runHumanDetect(input, canvas, now));
        }
        return result;
      })
      .catch(() => log('human detect error'));
  }
}

// main processing function when input is image, can use direct invocation or web worker
async function processImage(input, title) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onerror = async () => status('image loading error');
    image.onload = async () => {
      if (ui.hintsThread) clearInterval(ui.hintsThread);
      ui.interpolated = false; // stop interpolating results if input is image
      ui.buffered = false; // stop buffering result if input is image
      status(`processing image: ${title}`);
      const canvas = document.getElementById('canvas');
      image.width = image.naturalWidth;
      image.height = image.naturalHeight;
      canvas.width = userConfig.filter.width && userConfig.filter.width > 0 ? userConfig.filter.width : image.naturalWidth;
      canvas.height = userConfig.filter.height && userConfig.filter.height > 0 ? userConfig.filter.height : image.naturalHeight;
      const origCacheSensitiry = userConfig.cacheSensitivity;
      userConfig.cacheSensitivity = 0;
      const result = await human.detect(image, userConfig);
      userConfig.cacheSensitivity = origCacheSensitiry;
      lastDetectedResult = result;
      await drawResults(image);
      const thumb = document.createElement('canvas');
      thumb.className = 'thumbnail';
      const scale = Math.min(1, 1600 / canvas.width); // keep gallery images sharp without holding full resolution copies
      thumb.width = Math.round(canvas.width * scale);
      thumb.height = Math.round(canvas.height * scale);
      if (result.face && result.face.length > 0) {
        thumb.title = result.face.map((a, i) => `#${i + 1} ${a.gender} ${Math.trunc(100 * a.genderScore)}% · age ${Math.trunc(a.age)} · ${a.emotion?.[0]?.emotion || ''}`).join('   |   ');
      } else {
        thumb.title = 'No face detected';
      }
      thumb.addEventListener('click', (evt) => {
        const lightbox = document.getElementById('lightbox');
        document.getElementById('lightbox-image').src = evt.target.toDataURL('image/jpeg', 0.92);
        document.getElementById('lightbox-caption').innerText = `${title}  ·  ${evt.target.title}`;
        lightbox.classList.add('open');
      });
      const ctx = thumb.getContext('2d');
      ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, thumb.width, thumb.height);
      const prev = document.getElementsByClassName('thumbnail');
      if (prev && prev.length > 0) document.getElementById('samples-container').insertBefore(thumb, prev[0]);
      else document.getElementById('samples-container').appendChild(thumb);
      document.getElementById('samples-container').style.display = 'block';
      document.body.classList.add('has-run');

      // finish up
      status();
      document.getElementById('play').style.display = 'none';
      document.getElementById('loader').style.display = 'none';
      if (ui.detectThread) cancelAnimationFrame(ui.detectThread);
      if (ui.drawThread) cancelAnimationFrame(ui.drawThread);
      log('processed image:', title);
      resolve(true);
    };
    image.src = input;
  });
}

async function processVideo(input, title) {
  status(`processing video: ${title}`);
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  video.addEventListener('error', () => status(`video loading error: ${video.error.message}`));
  video.addEventListener('canplay', async () => {
    closeMenus(null);
    document.getElementById('samples-container').style.display = 'none';
    canvas.style.display = 'block';
    await videoPlay();
    runHumanDetect(video, canvas);
  });
  video.srcObject = null;
  video.src = input;
}

// just initialize everything and call main function
async function detectVideo() {
  document.getElementById('samples-container').style.display = 'none';
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  canvas.style.display = 'block';
  cancelAnimationFrame(ui.detectThread);
  if (isLive(video) && !video.paused) {
    await videoPause();
  } else {
    const cameraError = await setupCamera();
    if (!cameraError) {
      status('starting detection');
      closeMenus(null);
      await videoPlay();
      runHumanDetect(video, canvas);
    } else {
      status(cameraError);
    }
  }
}

// just initialize everything and call main function
async function detectSampleImages() {
  document.getElementById('play').style.display = 'none';
  document.getElementById('canvas').style.display = 'none';
  document.getElementById('samples-container').style.display = 'block';
  log('running detection of sample images');
  status('processing images');
  document.getElementById('samples-container').innerHTML = '';
  closeMenus(null);
  for (const image of ui.samples) await processImage(image, image);
}

function setupMenu() {
  menu.display = new Menu(document.body, '');
  menu.display.addHeader('Overlay', 'What gets drawn on top of the video', 'i-overlay');
  menu.display.addLabel('Interface');
  menu.display.addBool('Results inspector', ui, 'results', (val) => {
    ui.results = val;
    document.getElementById('results').style.display = ui.results ? 'block' : 'none';
  });
  menu.display.addBool('Performance monitor', ui, 'bench', (val) => ui.bench = val);
  menu.display.addBool('Smooth playback', ui, 'buffered', (val) => ui.buffered = val);
  menu.display.addBool('Crop to fill', ui, 'crop', (val) => {
    ui.crop = val;
    setupCamera();
  });
  menu.display.addBool('Front camera', ui, 'facing', (val) => {
    ui.facing = val;
    setupCamera();
  });
  menu.display.addLabel('Rendering');
  menu.display.addBool('Depth shading', drawOptions, 'useDepth');
  menu.display.addBool('Curved lines', drawOptions, 'useCurves');
  menu.display.addBool('Labels', drawOptions, 'drawLabels');
  menu.display.addBool('Keypoints', drawOptions, 'drawPoints');
  menu.display.addBool('Bounding boxes', drawOptions, 'drawBoxes');
  menu.display.addBool('Mesh outlines', drawOptions, 'drawPolygons');
  menu.display.addBool('Filled mesh', drawOptions, 'fillPolygons');
  menu.display.addBool('Gesture list', drawOptions, 'drawGestures');

  menu.image = new Menu(document.body, '');
  menu.image.addHeader('Filters', 'Tune the input before detection', 'i-filters');
  menu.image.addLabel('Input');
  menu.image.addBool('Enable filters', userConfig.filter, 'enabled', (val) => userConfig.filter.enabled = val);
  menu.image.addBool('Auto levels', userConfig.filter, 'equalization', (val) => userConfig.filter.equalization = val);
  ui.menuWidth = menu.image.addRange('Width', userConfig.filter, 'width', 0, 3840, 10, (val) => userConfig.filter.width = parseInt(val));
  ui.menuHeight = menu.image.addRange('Height', userConfig.filter, 'height', 0, 2160, 10, (val) => userConfig.filter.height = parseInt(val));
  menu.image.addLabel('Adjust');
  menu.image.addRange('Brightness', userConfig.filter, 'brightness', -1.0, 1.0, 0.05, (val) => userConfig.filter.brightness = parseFloat(val));
  menu.image.addRange('Contrast', userConfig.filter, 'contrast', -1.0, 1.0, 0.05, (val) => userConfig.filter.contrast = parseFloat(val));
  menu.image.addRange('Sharpness', userConfig.filter, 'sharpness', 0, 1.0, 0.05, (val) => userConfig.filter.sharpness = parseFloat(val));
  menu.image.addRange('Blur', userConfig.filter, 'blur', 0, 20, 1, (val) => userConfig.filter.blur = parseInt(val));
  menu.image.addRange('Saturation', userConfig.filter, 'saturation', -1.0, 1.0, 0.05, (val) => userConfig.filter.saturation = parseFloat(val));
  menu.image.addRange('Hue', userConfig.filter, 'hue', 0, 360, 5, (val) => userConfig.filter.hue = parseInt(val));
  menu.image.addRange('Pixelate', userConfig.filter, 'pixelate', 0, 32, 1, (val) => userConfig.filter.pixelate = parseInt(val));
  menu.image.addLabel('Effects');
  menu.image.addBool('Negative', userConfig.filter, 'negative', (val) => userConfig.filter.negative = val);
  menu.image.addBool('Sepia', userConfig.filter, 'sepia', (val) => userConfig.filter.sepia = val);
  menu.image.addBool('Vintage', userConfig.filter, 'vintage', (val) => userConfig.filter.vintage = val);
  menu.image.addBool('Kodachrome', userConfig.filter, 'kodachrome', (val) => userConfig.filter.kodachrome = val);
  menu.image.addBool('Technicolor', userConfig.filter, 'technicolor', (val) => userConfig.filter.technicolor = val);
  menu.image.addBool('Polaroid', userConfig.filter, 'polaroid', (val) => userConfig.filter.polaroid = val);
  const upload = menu.image.addHTML('<button type="button" class="btn menu-file"><svg class="i"><use href="#i-upload"/></svg>Analyze images or video</button>');
  upload.querySelector('button').addEventListener('click', () => document.getElementById('file-input').click());

  menu.process = new Menu(document.body, '');
  menu.process.addHeader('Engine', 'Runtime and face detector tuning', 'i-engine');
  menu.process.addLabel('Runtime');
  menu.process.addList('Compute backend', ['webgpu', 'webgl', 'wasm', 'humangl', 'cpu'], userConfig.backend, (val) => userConfig.backend = val);
  menu.process.addBool('Async pipeline', userConfig, 'async', (val) => userConfig.async = val);
  menu.process.addBool('Web worker', ui, 'useWorker');
  menu.process.addLabel('Face detector');
  menu.process.addRange('Max faces', userConfig.face.detector, 'maxDetected', 1, 50, 1, (val) => {
    userConfig.face.detector.maxDetected = parseInt(val);
    userConfig.body.maxDetected = parseInt(val);
    userConfig.hand.maxDetected = parseInt(val);
  });
  menu.process.addRange('Skip frames', userConfig.face.detector, 'skipFrames', 0, 50, 1, (val) => {
    userConfig.face.detector.skipFrames = parseInt(val);
    userConfig.face.emotion.skipFrames = parseInt(val);
    userConfig.hand.skipFrames = parseInt(val);
  });
  menu.process.addRange('Min confidence', userConfig.face.detector, 'minConfidence', 0.0, 1.0, 0.05, (val) => {
    userConfig.face.detector.minConfidence = parseFloat(val);
    userConfig.face.emotion.minConfidence = parseFloat(val);
    userConfig.hand.minConfidence = parseFloat(val);
  });
  menu.process.addRange('Overlap (IoU)', userConfig.face.detector, 'iouThreshold', 0.1, 1.0, 0.05, (val) => {
    userConfig.face.detector.iouThreshold = parseFloat(val);
    userConfig.hand.iouThreshold = parseFloat(val);
  });
  menu.process.addBool('Rotation correction', userConfig.face.detector, 'rotation', (val) => {
    userConfig.face.detector.rotation = val;
    userConfig.hand.rotation = val;
  });
  menu.process.addLabel('Performance');
  menu.process.addChart('Detection speed', 'FPS');

  menu.models = new Menu(document.body, '');
  menu.models.addHeader('Models', 'Choose what to detect', 'i-models');
  menu.models.addLabel('Face');
  menu.models.addBool('Face detection', userConfig.face, 'enabled', (val) => userConfig.face.enabled = val);
  menu.models.addBool('Face mesh · 468 points', userConfig.face.mesh, 'enabled', (val) => userConfig.face.mesh.enabled = val);
  menu.models.addBool('Iris & gaze', userConfig.face.iris, 'enabled', (val) => userConfig.face.iris.enabled = val);
  menu.models.addBool('Age, gender & identity', userConfig.face.description, 'enabled', (val) => userConfig.face.description.enabled = val);
  menu.models.addBool('Emotion', userConfig.face.emotion, 'enabled', (val) => userConfig.face.emotion.enabled = val);
  menu.models.addBool('Live face compare', compare, 'enabled', (val) => {
    compare.enabled = val;
    compare.original = null;
  });
  menu.models.addLabel('Body');
  menu.models.addBool('Body pose', userConfig.body, 'enabled', (val) => userConfig.body.enabled = val);
  menu.models.addBool('Hands & fingers', userConfig.hand, 'enabled', (val) => userConfig.hand.enabled = val);
  menu.models.addBool('Gestures', userConfig.gesture, 'enabled', (val) => userConfig.gesture.enabled = val);
  menu.models.addLabel('Scene');
  menu.models.addBool('Objects', userConfig.object, 'enabled', (val) => userConfig.object.enabled = val);

  const buttons = { btnDisplay: 'display', btnImage: 'image', btnProcess: 'process', btnModel: 'models' };
  for (const [id, key] of Object.entries(buttons)) {
    document.getElementById(id).addEventListener('click', (evt) => {
      evt.stopPropagation();
      positionMenus();
      menu[key].toggle();
      closeMenus(menu[key].visible() ? key : null);
    });
  }
  for (const m of Object.values(menu)) m.menu.addEventListener('click', (evt) => evt.stopPropagation());
  document.addEventListener('click', () => closeMenus(null));
  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      closeMenus(null);
      document.getElementById('lightbox').classList.remove('open');
    }
  });
  document.getElementById('lightbox').addEventListener('click', (evt) => evt.currentTarget.classList.remove('open'));
  document.getElementById('btnStart').addEventListener('click', (evt) => {
    evt.stopPropagation();
    detectVideo();
  });
  for (const id of ['btnHeroStart', 'btnResume']) document.getElementById(id).addEventListener('click', () => detectVideo());
  for (const id of ['btnUpload', 'btnHeroUpload']) document.getElementById(id).addEventListener('click', () => document.getElementById('file-input').click());
}

async function resize() {
  window.onresize = null;
  log('resize');
  closeMenus(null);
  positionMenus();
  if (document.getElementById('video').srcObject) await setupCamera(); // only re-init camera once the user started it, so the page does not ask for camera access on load
  window.onresize = resize;
}

async function drawWarmup(res) {
  const canvas = document.getElementById('canvas');
  canvas.width = res.canvas.width;
  canvas.height = res.canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(res.canvas, 0, 0, res.canvas.width, res.canvas.height, 0, 0, canvas.width, canvas.height);
  await human.draw.all(canvas, res, drawOptions);
}

async function processDataURL(f, action) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (action === 'process') {
        if (e.target.result.startsWith('data:image')) await processImage(e.target.result, f.name);
        if (e.target.result.startsWith('data:video')) await processVideo(e.target.result, f.name);
        document.getElementById('canvas').style.display = 'none';
      }
      resolve(true);
    };
    reader.readAsDataURL(f);
  });
}

async function dragAndDrop() {
  document.body.addEventListener('dragenter', (evt) => {
    evt.preventDefault();
    document.body.classList.add('dragging');
  });
  document.body.addEventListener('dragleave', (evt) => {
    evt.preventDefault();
    if (!evt.relatedTarget) document.body.classList.remove('dragging'); // left the window
  });
  document.body.addEventListener('dragover', (evt) => evt.preventDefault());
  document.body.addEventListener('drop', async (evt) => {
    evt.preventDefault();
    document.body.classList.remove('dragging');
    evt.dataTransfer.dropEffect = 'copy';
    if (evt.dataTransfer.files.length < 2) ui.columns = 1;
    for (const f of evt.dataTransfer.files) await processDataURL(f, 'process');
  });
  document.getElementById('file-input').onchange = async (evt) => {
    evt.preventDefault();
    if (evt.target.files.length < 2) ui.columns = 1;
    for (const f of evt.target.files) await processDataURL(f, 'process');
  };
}

async function drawHints() {
  const hint = document.getElementById('hint');
  ui.hintsThread = setInterval(() => {
    const rnd = Math.trunc(Math.random() * hints.length);
    hint.innerHTML = `<b>Tip</b>${esc(hints[rnd])}`;
    hint.style.opacity = 1;
    setTimeout(() => {
      hint.style.opacity = 0;
    }, 4500);
  }, 5000);
}

async function pwaRegister() {
  if (!pwa.enabled) return;
  if ('serviceWorker' in navigator) {
    try {
      let found;
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        log('pwa found:', reg.scope);
        if (reg.scope.startsWith(window.location.origin)) found = reg;
      }
      if (!found) {
        const reg = await navigator.serviceWorker.register(pwa.scriptFile, { scope: window.location.pathname });
        found = reg;
        log('pwa registered:', reg.scope);
      }
    } catch (err) {
      if (err.name === 'SecurityError') log('pwa: ssl certificate is untrusted');
      else log('pwa error:', err);
    }
    if (navigator.serviceWorker.controller) {
      // update pwa configuration as it doesn't have access to it
      navigator.serviceWorker.controller.postMessage({ key: 'cacheModels', val: pwa.cacheModels });
      navigator.serviceWorker.controller.postMessage({ key: 'cacheWASM', val: pwa.cacheWASM });
      navigator.serviceWorker.controller.postMessage({ key: 'cacheOther', val: pwa.cacheOther });

      log('pwa ctive:', navigator.serviceWorker.controller.scriptURL);
      const cache = await caches.open(pwa.cacheName);
      if (cache) {
        const content = await cache.matchAll();
        log('pwa cache:', content.length, 'files');
      }
    }
  } else {
    log('pwa inactive');
  }
}

async function main() {
  if (ui.exceptionHandler) {
    window.addEventListener('unhandledrejection', (evt) => {
      if (ui.detectThread) cancelAnimationFrame(ui.detectThread);
      if (ui.drawThread) cancelAnimationFrame(ui.drawThread);
      const msg = evt.reason.message || evt.reason || evt;
      console.error(msg); // eslint-disable-line no-console
      document.getElementById('log').innerHTML = `<span class="stat err">${esc(msg)}</span>`;
      status(`exception: ${msg}`);
      evt.preventDefault();
    });
  }

  log('demo starting ...');

  drawHints();

  // sanity check for webworker compatibility
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    ui.useWorker = false;
    log('webworker functionality is disabled due to missing browser functionality');
  }

  // register PWA ServiceWorker
  await pwaRegister();

  // parse url search params
  const params = new URLSearchParams(window.location.search);
  log('url options:', params.toString());
  if (params.has('worker')) {
    ui.useWorker = JSON.parse(params.get('worker'));
    log('overriding worker:', ui.useWorker);
  }
  if (params.has('backend')) {
    userConfig.backend = params.get('backend'); // string
    log('overriding backend:', userConfig.backend);
  }
  if (params.has('preload')) {
    ui.modelsPreload = JSON.parse(params.get('preload'));
    log('overriding preload:', ui.modelsPreload);
  }
  if (params.has('warmup')) {
    ui.modelsWarmup = params.get('warmup'); // string
    log('overriding warmup:', ui.modelsWarmup);
  }
  if (params.has('bench')) {
    ui.bench = JSON.parse(params.get('bench'));
    log('overriding bench:', ui.bench);
  }
  if (params.has('play')) {
    ui.autoPlay = true;
    log('overriding autoplay:', true);
  }
  if (params.has('draw')) {
    ui.drawWarmup = JSON.parse(params.get('draw'));
    log('overriding drawWarmup:', ui.drawWarmup);
  }
  if (params.has('async')) {
    userConfig.async = JSON.parse(params.get('async'));
    log('overriding async:', userConfig.async);
  }

  // create instance of human
  human = new Human(userConfig);
  // human.env.perfadd = true;

  log('human version:', human.version);
  // we've merged human defaults with user config and now lets store it back so it can be accessed by methods such as menu
  userConfig = human.config;
  if (typeof tf !== 'undefined') {
    log('TensorFlow external version:', tf.version); // eslint-disable-line no-undef
    human.tf = tf; // eslint-disable-line no-undef
  }
  log('tfjs version:', human.tf.version.tfjs);

  // setup main menu
  await setupMenu();
  await resize();
  document.getElementById('log').innerHTML = `<span class="stat">Backend <b>${esc(human.tf.getBackend() || userConfig.backend)}</b></span><span class="stat">Models <b>local</b></span><span class="stat stat-brand">human v${esc(human.version)}</span>`;

  // preload models
  if (ui.modelsPreload && !ui.useWorker) {
    status('loading');
    await human.load(userConfig); // this is not required, just pre-loads all models
    log('demo loaded models:', human.models.loaded());
  } else {
    await human.init();
  }

  // warmup models
  if (ui.modelsWarmup && !ui.useWorker) {
    status('initializing');
    if (!userConfig.warmup || userConfig.warmup === 'none') userConfig.warmup = 'full';
    const res = await human.warmup(userConfig); // this is not required, just pre-warms all models for faster initial inference
    if (res && res.canvas && ui.drawWarmup) await drawWarmup(res);
  }

  // ready
  status('ready · models loaded');
  document.getElementById('log').innerHTML = [
    `<span class="stat">Backend <b>${esc(human.tf.getBackend())}</b></span>`,
    '<span class="stat">Models <b>on device</b></span>',
    `<span class="stat">Mode <b>${ui.useWorker ? 'web worker' : 'main thread'}</b></span>`,
    `<span class="stat stat-brand">human v${esc(human.version)}</span>`,
  ].join('');
  document.getElementById('loader').style.display = 'none';
  document.getElementById('play').style.display = 'block';
  document.getElementById('results').style.display = 'none';

  // init drag & drop
  await dragAndDrop();

  if (params.has('image')) {
    try {
      const image = JSON.parse(params.get('image'));
      log('overriding image:', image);
      ui.samples = [image];
      ui.columns = 1;
    } catch {
      status('cannot parse input image');
      log('cannot parse input image', params.get('image'));
      ui.samples = [];
    }
    if (ui.samples.length > 0) await detectSampleImages();
  }

  if (params.has('images')) {
    log('overriding images list:', JSON.parse(params.get('images')));
    await detectSampleImages();
  }

  if (human.config.debug) log('environment:', human.env);
  if (human.config.backend === 'webgl' && human.config.debug) log('backend:', human.gl);
}

window.onload = main;
