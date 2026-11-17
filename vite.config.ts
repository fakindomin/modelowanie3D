import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base './' lets the build work from any sub-path (GitHub Pages, static hosting).
// `vite build --mode single` produces one self-contained index.html for quick sharing.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: Infinity } : {},
  optimizeDeps: { exclude: ['manifold-3d'] },
  // Changes with every build: start-page pictures saved in the browser are redrawn after an update.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
}));
