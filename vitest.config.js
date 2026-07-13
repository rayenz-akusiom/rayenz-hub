import { defineConfig } from 'vitest/config';

export default defineConfig({
   test: {
      environment: 'happy-dom',
      environmentMatchGlobs: [
         ['tests/api/**', 'node'],
      ],
      include: ['tests/unit/**/*.test.js', 'tests/api/**/*.test.ts'],
   },
});
