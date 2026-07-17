import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
   plugins: [react()],
   resolve: {
      alias: {
         '@rayenz-hub/shared': path.resolve(rootDir, 'packages/shared/src/index.ts'),
      },
   },
   test: {
      environment: 'happy-dom',
      environmentMatchGlobs: [
         ['tests/api/**', 'node'],
      ],
      include: ['tests/unit/**/*.test.{js,ts,tsx}', 'tests/api/**/*.test.ts'],
      exclude: ['tests/api/deployed.contract.test.ts'],
   },
});
