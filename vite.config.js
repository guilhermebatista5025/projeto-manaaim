import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        pdv: resolve(import.meta.dirname, 'index.html'),
        formulario: resolve(import.meta.dirname, 'cantina-formulario-icm-main/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
