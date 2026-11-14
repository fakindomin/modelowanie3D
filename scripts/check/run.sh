#!/bin/sh
# Bundles the check against a Node copy of src/geom/manifold.ts (no Vite WASM import) and runs it.
set -e
cd "$(dirname "$0")"
sed -e "/manifold.wasm?url/d" -e "s/const config: Record<string, unknown> = { locateFile: () => wasmUrl };/const config: Record<string, unknown> = {};/" -e "/wasmUrl.startsWith/d" ../../src/geom/manifold.ts > mshim.ts
sed -i "s#'../src/#'../../src/#g" parts.ts
node build.cjs parts.ts parts.mjs
node parts.mjs "$@"
