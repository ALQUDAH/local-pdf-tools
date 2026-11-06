import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import {defineConfig, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

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
  plugins: [
    react(),
    tailwindcss(),
    tesseractAssets(),
    // Installable app + offline support. Disabled for the desktop build, which is already offline.
    VitePWA({
      disable: process.env.DISABLE_PWA === 'true',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Local PDF Tools',
        short_name: 'PDF Tools',
        description: '30+ PDF tools that run entirely in your browser. Your files never leave your device.',
        theme_color: '#059669',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {src: 'pwa-192.png', sizes: '192x192', type: 'image/png'},
          {src: 'pwa-512.png', sizes: '512x512', type: 'image/png'},
          {src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
        ],
      },
      workbox: {
        // App shell, tool chunks, PDF.js worker and qpdf.wasm are precached for offline use.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,wasm}'],
        globIgnores: ['tesseract/**', 'social-preview.png'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // OCR engine (large): cached the first time OCR is used
            urlPattern: ({url}) => url.pathname.includes('/tesseract/'),
            handler: 'CacheFirst',
            options: {cacheName: 'ocr-engine', expiration: {maxEntries: 8}},
          },
          {
            // OCR language models and fonts from jsDelivr
            urlPattern: ({url}) => url.hostname.endsWith('jsdelivr.net'),
            handler: 'CacheFirst',
            options: {cacheName: 'ocr-data', expiration: {maxEntries: 30}, cacheableResponse: {statuses: [0, 200]}},
          },
          {
            urlPattern: ({url}) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {cacheName: 'google-fonts', cacheableResponse: {statuses: [0, 200]}},
          },
        ],
      },
    }),
  ],
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
