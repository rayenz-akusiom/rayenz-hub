import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Full packages/web coverage report (no threshold). Use to find gaps outside the gate.
 * See AGENTS.md → Testing & coverage.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@rayenz-hub/shared': path.resolve(rootDir, 'packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    environmentMatchGlobs: [['tests/web/**', 'jsdom']],
    setupFiles: ['./tests/web/setup.ts'],
    include: ['tests/unit/**/*.test.{js,ts,tsx}', 'tests/web/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage/web-full',
      clean: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      all: true,
      include: ['packages/web/src/**/*.{ts,tsx}'],
      exclude: [
        'packages/web/src/**/*.d.ts',
        'packages/web/src/**/main.tsx',
        'packages/web/src/**/types.ts',
        'packages/web/src/**/index.ts',
      ],
    },
    fileParallelism: false,
  },
});
