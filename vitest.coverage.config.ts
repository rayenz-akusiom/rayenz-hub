import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Unified coverage run for packages/web (unit + React web tests).
 * Gate: ≥80% branches across SPA logic + UI (see AGENTS.md).
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
    include: [
      'tests/unit/**/*.test.{js,ts,tsx}',
      'tests/web/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage/web-gate',
      clean: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      all: false,
      include: ['packages/web/src/**/*.{ts,tsx}'],
      exclude: [
        'packages/web/src/**/*.d.ts',
        'packages/web/src/**/main.tsx',
        'packages/web/src/**/types.ts',
        'packages/web/src/**/index.ts',
        // Non-UI orchestration / bridge giants — tracked via test:coverage:full.
        'packages/web/src/mtg/archidekt-export.ts',
        'packages/web/src/mtg/order-reconcile-export.ts',
        'packages/web/src/mtg/profile-sync.ts',
        'packages/web/src/dailies/itemdb.ts',
        'packages/web/src/deck-suggest/generation.ts',
        'packages/web/src/lib/pet-image-slug.ts',
        'packages/web/src/dailies/icons.ts',
      ],
      thresholds: {
        branches: 80,
      },
    },
    fileParallelism: false,
  },
});
