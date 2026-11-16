#!/bin/sh
# Jak run.sh, ale dla swieta.ts (zgodność z Pythonem, tools/swieta/ref.json).
set -e
cd "$(dirname "$0")"
sed -e "/manifold.wasm?url/d" -e "s/const config: Record<string, unknown> = { locateFile: () => wasmUrl };/const config: Record<string, unknown> = {};/" -e "/wasmUrl.startsWith/d" ../../src/geom/manifold.ts > mshim.ts
node build.cjs swieta.ts swieta.mjs
node swieta.mjs "$@"
