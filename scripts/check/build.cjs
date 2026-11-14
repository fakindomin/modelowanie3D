const path = require('path');
require('esbuild').build({ entryPoints: [process.argv[2]], bundle: true, platform: 'node', format: 'esm', external: ['manifold-3d'], outfile: process.argv[3], logLevel: 'error',
  plugins: [{ name: 'shim', setup(b) { b.onResolve({ filter: /^\.{1,2}\/(.*\/)?manifold$/ }, (a) => a.importer.includes('scripts/check') && a.path.includes('src/geom') === false ? undefined : ({ path: path.resolve(__dirname, 'mshim.ts') })); } }] });
