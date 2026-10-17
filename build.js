const fs = require('fs');
const path = require('path');
const log = require('@vladmandic/pilogger'); // eslint-disable-line node/no-unpublished-require
const Build = require('@vladmandic/build').Build; // eslint-disable-line node/no-unpublished-require
const APIExtractor = require('@microsoft/api-extractor'); // eslint-disable-line node/no-unpublished-require
const packageJSON = require('./package.json');

const logFile = 'test/build.log';
const modelsOut = 'models/models.json';
const modelsFolders = [
  './models',
  '../human-models/models',
  '../blazepose/model/',
  '../anti-spoofing/model',
  '../efficientpose/models',
  '../insightface/models',
  '../movenet/models',
  '../nanodet/models',
];

const apiExtractorIgnoreList = [ // eslint-disable-line no-unused-vars
  'ae-missing-release-tag',
  'tsdoc-param-tag-missing-hyphen',
  'tsdoc-escape-right-brace',
  'tsdoc-undefined-tag',
  'tsdoc-escape-greater-than',
  'ae-unresolved-link',
  'ae-forgotten-export',
  'tsdoc-malformed-inline-tag',
  'tsdoc-unnecessary-backslash',
];

const regEx = [
  { search: 'types="@webgpu/types/dist"', replace: 'path="../src/types/webgpu.d.ts"' },
  { search: 'types="offscreencanvas"', replace: 'path="../src/types/offscreencanvas.d.ts"' },
];

function copyFile(src, dst) {
  if (!fs.existsSync(src)) {
    log.warn('Copy:', { input: src, output: dst });
    return;
  }
  log.state('Copy:', { input: src, output: dst });
  const buffer = fs.readFileSync(src);
  fs.writeFileSync(dst, buffer);
}

function writeFile(str, dst) {
  log.state('Write:', { output: dst });
  fs.writeFileSync(dst, str);
}

function regExFile(src, entries) {
  if (!fs.existsSync(src)) {
    log.warn('Filter:', { src });
    return;
  }
  log.state('Filter:', { input: src });
  for (const entry of entries) {
    const buffer = fs.readFileSync(src, 'UTF-8');
    const lines = buffer.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
      if (line.includes(entry.search)) out.push(line.replace(entry.search, entry.replace));
      else out.push(line);
    }
    fs.writeFileSync(src, out.join('\n'));
  }
}

async function analyzeModels() {
  // model weight sizes are read directly from model manifests so build does not depend on native tfjs-node bindings
  log.info('Analyze models:', { folders: modelsFolders.length, result: modelsOut });
  const models = fs.existsSync(modelsOut) ? JSON.parse(fs.readFileSync(modelsOut, 'utf8')) : {}; // keep entries for models that are not available locally
  let totalSize = 0;
  for (const folder of modelsFolders) {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) continue;
    const found = fs.readdirSync(folder).filter((f) => f.endsWith('.json') && f !== path.basename(modelsOut));
    log.state('Models', { folder, models: found.length });
    for (const file of found) {
      try {
        const json = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
        if (!json.weightsManifest) continue;
        const paths = json.weightsManifest.flatMap((group) => group.paths);
        const size = paths.reduce((sum, p) => sum + (fs.existsSync(path.join(folder, p)) ? fs.statSync(path.join(folder, p)).size : 0), 0);
        const name = file.replace('.json', '');
        totalSize += size;
        models[name] = size;
      } catch (err) {
        log.warn('Analyze model:', { folder, file, err: err.message });
      }
    }
  }
  delete models[path.basename(modelsOut, '.json')]; // models.json itself is not a model
  fs.writeFileSync(modelsOut, JSON.stringify(models, null, 2));
  log.state('Models:', { count: Object.keys(models).length, totalSize });
}

async function main() {
  log.logFile(logFile);
  log.data('Build', { name: packageJSON.name, version: packageJSON.version });

  // run production build
  const build = new Build();
  await build.run('production');

  // patch tfjs typedefs
  copyFile('node_modules/@vladmandic/tfjs/types/tfjs-core.d.ts', 'types/tfjs-core.d.ts');
  copyFile('node_modules/@vladmandic/tfjs/types/tfjs.d.ts', 'types/tfjs.esm.d.ts');
  copyFile('src/types/tsconfig.json', 'types/tsconfig.json');
  copyFile('src/types/eslint.json', 'types/.eslintrc.json');
  copyFile('src/types/tfjs.esm.d.ts', 'dist/tfjs.esm.d.ts');
  regExFile('types/tfjs-core.d.ts', regEx);

  // run api-extractor to create typedef rollup
  const extractorConfig = APIExtractor.ExtractorConfig.loadFileAndPrepare('.api-extractor.json');
  try {
    const extractorResult = APIExtractor.Extractor.invoke(extractorConfig, {
      localBuild: true,
      showVerboseMessages: false,
      messageCallback: (msg) => {
        msg.handled = true;
        if (msg.logLevel === 'none' || msg.logLevel === 'verbose' || msg.logLevel === 'info') return;
        if (msg.sourceFilePath?.includes('/node_modules/')) return;
        // if (apiExtractorIgnoreList.reduce((prev, curr) => prev || msg.messageId.includes(curr), false)) return; // those are external issues outside of human control
        log.data('API', { level: msg.logLevel, category: msg.category, id: msg.messageId, file: msg.sourceFilePath, line: msg.sourceFileLine, text: msg.text });
      },
    });
    log.state('API-Extractor:', { succeeeded: extractorResult.succeeded, errors: extractorResult.errorCount, warnings: extractorResult.warningCount });
  } catch (err) {
    log.error('API-Extractor:', err);
  }
  regExFile('types/human.d.ts', regEx);
  writeFile('export * from \'../types/human\';', 'dist/human.esm-nobundle.d.ts');
  writeFile('export * from \'../types/human\';', 'dist/human.esm.d.ts');
  writeFile('export * from \'../types/human\';', 'dist/human.d.ts');
  writeFile('export * from \'../types/human\';', 'dist/human.node-gpu.d.ts');
  writeFile('export * from \'../types/human\';', 'dist/human.node.d.ts');
  writeFile('export * from \'../types/human\';', 'dist/human.node-wasm.d.ts');

  // generate model signature
  await analyzeModels();
  log.info('Human Build complete...', { logFile });
}

main();
