// game-editor/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // 👈 critical for Electron builds
  build: {
    outDir: 'dist-build'
  }
});