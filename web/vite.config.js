import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3311', '/badge': 'http://localhost:3311', '/media': 'http://localhost:3311' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
