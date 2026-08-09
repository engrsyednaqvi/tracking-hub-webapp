import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages project site: https://<user>.github.io/tracking-hub-webapp/
export default defineConfig({
  plugins: [react()],
  base: '/tracking-hub-webapp/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
