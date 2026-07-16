import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@rayenz-hub/shared': path.resolve(rootDir, '../shared/src/index.ts'),
    },
  },
  build: {
    outDir: path.resolve(rootDir, '../../rayenz-hub/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        settings: path.resolve(rootDir, 'settings/index.html'),
        dailies: path.resolve(rootDir, 'dailies/index.html'),
      },
    },
  },
});
