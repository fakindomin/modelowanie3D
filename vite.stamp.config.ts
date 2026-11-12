import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npx vite build -c vite.stamp.config.ts`: the „Znak na STL” tool as one self-contained stamp.html (dist-stamp/).
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-stamp', emptyOutDir: true, assetsInlineLimit: Infinity, rollupOptions: { input: 'stamp.html' } },
  optimizeDeps: { exclude: ['manifold-3d'] },
});
