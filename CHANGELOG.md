# human

  Version: **3.0.0**  
  Description: **Human by Nima Dorostkar: AI-powered 3D Face Detection & Rotation Tracking, Face Description & Recognition, Body Pose Tracking, 3D Hand & Finger Tracking, Iris Analysis, Age & Gender & Emotion Prediction, Gaze Tracking, Gesture Recognition**  
  
  Author: **Nima Dorostkar <nimadorostkar97@gmail.com>**  
  License: **MIT**  
  Repository: **<https://github.com/nimadorostkar/human>**  
  
## Changelog

### **3.0.0** 2026/10/17 nimadorostkar97@gmail.com

- new **Vision Studio** main demo: redesigned interface with custom icon set, Overlay / Filters / Engine / Models panels, live stats bar, photo gallery with lightbox, drag and drop overlay and mobile layout
- main demo asks for camera access only when the camera is started, detects up to 10 faces and offers the `webgpu` backend
- new `demo/nodejs/node-analyze.js`: annotates a folder of photos with face, body and gesture results plus a details panel, using tiled multi-pass face detection for large, cropped or edge-touching faces
- shorter, rewritten README with result images

### **1.0.0** 2026/10/17 nimadorostkar97@gmail.com

- initial release of `human` by Nima Dorostkar
- based on [Human](https://github.com/vladmandic/human) v3.3.6 by Vladimir Mandic (MIT)
- rebranded package name, metadata, banners and documentation
- published as `@nimadorostkar/human` (the unscoped `human` name is taken on npm)
- fixed `exports` map so subpath imports such as `@nimadorostkar/human/dist/human.esm.js` resolve; added `files` whitelist so the package ships only `dist`, `types` and `models`
- full `npm run build` no longer needs native `tfjs-node`, so it runs on any Node.js version
- test runner now exits with an error code when any test fails; CUDA backend test is opt-in via `HUMAN_TEST_GPU=true`
- fixed lint errors in `draw.all` and model loading; demo TypeScript files are now linted
- demos load bundled local models instead of a third-party host
- added CI (lint, typecheck, build, tests), CodeQL v3, Dependabot, tag-based npm release with provenance, GitHub Pages deployment and a production Docker image
- added landing page for the demo site
- minimum Node.js version is now 18
- added `npm run serve`, `npm run compile` and `npm run typecheck` scripts

For history prior to 1.0.0, see the upstream changelog: <https://github.com/vladmandic/human/blob/main/CHANGELOG.md>
