import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base keeps the build working both at a domain root and under a
  // GitHub Pages project path such as /car-dash/.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true,
    port: 5173,
  },
});
