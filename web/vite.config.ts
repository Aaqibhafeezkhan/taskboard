import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Can be served under any sub-path (example.com/taskboard/, GitHub Pages), so every asset URL is relative.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://127.0.0.1:8823',
      '/shots': 'http://127.0.0.1:8823',
      '/ws': { target: 'ws://127.0.0.1:8823', ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
