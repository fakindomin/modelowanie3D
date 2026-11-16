#!/bin/sh
# Jak run.sh, ale dla pudelko.ts (zgodność z tools/pudelko/pudelko.py).
set -e
cd "$(dirname "$0")"
sed -e "/manifold.wasm?url/d" -e "s/const config: Record<string, unknown> = { locateFile: () => wasmUrl };/const config: Record<string, unknown> = {};/" -e "/wasmUrl.startsWith/d" ../../src/geom/manifold.ts > mshim.ts
node build.cjs pudelko.ts pudelko.mjs
node pudelko.mjs "$@"
