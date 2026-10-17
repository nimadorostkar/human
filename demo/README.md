# human: Demos

Run all demos locally with `npm run serve` and open <http://localhost:8000>

For a list of all demos see the main [README](../README.md#demos)

## Main Demo


`index.html`: Full demo using `Human` ESM module running in Browsers,  

Includes:

- Selectable inputs:
  - Sample images
  - Image via drag & drop
  - Image via URL param
  - WebCam input
  - Video stream
  - WebRTC stream
- Selectable active `Human` modules
  - With interactive module params
- Interactive `Human` image filters
- Selectable interactive `results` browser
- Selectable `backend`
- Multiple execution methods:
  - Sync vs Async
  - in main thread or web worker
  - live on git pages, on user-hosted web server or via included included dev server (`npm run serve`)

### Demo Options

- General `Human` library options  
  in `index.js:userConfig`
- General `Human` `draw` options  
  in `index.js:drawOptions`
- Demo PWA options  
  in `index.js:pwa`
- Demo specific options  
  in `index.js:ui`

```js
const ui = {
  console: true,      // log messages to browser console
  useWorker: true,    // use web workers for processing
  buffered: true,     // should output be buffered between frames
  interpolated: true, // should output be interpolated for smoothness between frames
  results: false,     // show results tree
  useWebRTC: false,   // use webrtc as camera source instead of local webcam
};
```

Demo implements several ways to use `Human` library,  

### URL Params

Demo app can use URL parameters to override configuration values  
For example:

- Force using `WASM` as backend: <http://localhost:8000/demo/index.html?backend=wasm>
- Enable `WebWorkers`: <http://localhost:8000/demo/index.html?worker=true>
- Skip pre-loading and warming up: <http://localhost:8000/demo/index.html?preload=false&warmup=false>

### WebRTC

Note that WebRTC connection requires a WebRTC server that provides a compatible media track such as H.264 video track  
For such a WebRTC server implementation see <https://github.com/vladmandic/stream-rtsp> project  
that implements a connection to IP Security camera using RTSP protocol and transcodes it to WebRTC  
ready to be consumed by a client such as `Human`
