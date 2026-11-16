import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npx vite build -c vite.pudelko.config.ts`: konfigurator pudełka jako jeden plik pudelko.html (dist-pudelko/), WASM w środku.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-pudelko', emptyOutDir: true, assetsInlineLimit: Infinity, rollupOptions: { input: 'pudelko.html' } },
  optimizeDeps: { exclude: ['manifold-3d'] },
});
