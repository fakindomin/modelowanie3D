import { defineConfig } from 'vite';

// `npm run build:lite`: one script for a shop page (dist-lite/model3d.js, WASM inlined), see src/lite/index.ts.
export default defineConfig({
  build: {
    outDir: 'dist-lite',
    emptyOutDir: true,
    assetsInlineLimit: Infinity,
    lib: { entry: 'src/lite/index.ts', name: 'Model3DLib', formats: ['iife'], fileName: () => 'model3d.js' },
  },
  optimizeDeps: { exclude: ['manifold-3d'] },
});
