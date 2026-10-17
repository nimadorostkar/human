# Security & Privacy Policy

## Supported versions

Security fixes are released for the latest published version of `@nimadorostkar/human`.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.  
Report them privately through [GitHub security advisories](https://github.com/nimadorostkar/human/security/advisories/new) or by email to **Nima Dorostkar** <nimadorostkar97@gmail.com>.

Include a description, steps to reproduce and the affected version. You can expect an initial reply within 7 days.

## Automated checks

Every push and pull request runs lint, type-checking, a full build and the Node.js test suite.  
Dependencies and code are scanned automatically:

- [Dependabot alerts](https://github.com/nimadorostkar/human/security/dependabot)
- [CodeQL code scanning](https://github.com/nimadorostkar/human/security/code-scanning)

The published npm package has **no runtime dependencies**; TensorFlow/JS is bundled into `dist/`.

## Privacy

The `human` library and the included demo apps:

- Run detection locally, in the browser or in Node.js; images, video and results are never uploaded
- Do not store user inputs or detection results, except where a demo says so (the *Face ID* demo keeps face descriptors in the browser's IndexedDB)
- Do not use any analytics or tracking services

The library makes network requests *only* for:

- Loading models from `modelBasePath` (local by default; a CDN only if you configure one)
- Loading WASM binaries from `wasmPath` when the `wasm` backend is used (defaults to the jsDelivr CDN; host the files yourself to avoid this)
- Loading inputs you pass as `http` or `https` URLs

## Usage restrictions

See [CODE_OF_CONDUCT](CODE_OF_CONDUCT): `human` must not be used for life-critical decisions or for surveillance without the consent of the people being observed.
