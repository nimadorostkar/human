#!/usr/bin/env sh
# Assemble the static demo site (demos, library bundles, models, samples, api docs) into a single folder
# usage: deploy/site.sh <output-folder>
set -eu

OUT="${1:-_site}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$ROOT/dist/human.esm.js" ]; then
  echo "dist/human.esm.js not found, run 'npm run build' first" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"
for dir in demo dist models samples assets typedoc; do
  [ -d "$ROOT/$dir" ] && cp -R "$ROOT/$dir" "$OUT/$dir"
done
rm -rf "$OUT/demo/nodejs" "$OUT/demo/multithread/node-multiprocess.js" "$OUT/demo/multithread/node-multiprocess-worker.js" "$OUT/demo/facematch/node-match.js"
cp "$ROOT/favicon.ico" "$OUT/favicon.ico"
cp "$ROOT/deploy/index.html" "$OUT/index.html"
touch "$OUT/.nojekyll"
echo "Static site assembled in $OUT ($(du -sh "$OUT" | cut -f1))"
