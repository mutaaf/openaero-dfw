import { defineConfig } from 'vite';

// Served at https://mutaafaziz.com/openaero/ by the openaero-dfw Worker.
// outDir mirrors the base path so the Worker's asset lookup (/openaero/...) matches files.
export default defineConfig({
  base: '/openaero/',
  build: {
    outDir: 'dist/openaero',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
