import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  // Set BASE_PATH when deploying under a sub-path, e.g. GitHub Pages: BASE_PATH=/local-pdf-tools/
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    // The bundled PDF.js worker is large by nature; tool code is split per route.
    chunkSizeWarningLimit: 1500,
  },
});
