import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import {defineConfig, type Plugin} from 'vite';

/**
 * Serves the Tesseract.js worker and WASM cores from the app itself (under /tesseract/)
 * instead of jsDelivr, so OCR code is never fetched from a third-party CDN.
 */
function tesseractAssets(): Plugin {
  const files: Record<string, string> = {
    'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
    'tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-relaxedsimd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  };
  return {
    name: 'tesseract-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/\/tesseract\/([\w.-]+)$/);
        const source = match && files[match[1]];
        if (!source) return next();
        res.setHeader('Content-Type', 'text/javascript');
        fs.createReadStream(path.resolve(import.meta.dirname, source)).pipe(res);
      });
    },
    generateBundle() {
      for (const [name, source] of Object.entries(files)) {
        this.emitFile({type: 'asset', fileName: `tesseract/${name}`, source: fs.readFileSync(source)});
      }
    },
  };
}

export default defineConfig({
  // Set BASE_PATH when deploying under a sub-path, e.g. GitHub Pages: BASE_PATH=/local-pdf-tools/
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss(), tesseractAssets()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  build: {
    // The bundled PDF.js worker is large by nature; tool code is split per route.
    chunkSizeWarningLimit: 1500,
  },
});
