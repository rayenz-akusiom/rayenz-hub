import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Unified coverage run for packages/web (unit + React web tests).
 * Gate: ≥80% branches on the coverage *core* (logic + hub chrome).
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
    // happy-dom matches tests/unit; jsdom for React DOM assertions in tests/web.
    environment: 'happy-dom',
    environmentMatchGlobs: [
      ['tests/web/**', 'jsdom'],
    ],
    setupFiles: ['./tests/web/setup.ts'],
    include: [
      'tests/unit/**/*.test.{js,ts,tsx}',
      'tests/web/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      // Keep this path dedicated to the gated run (no concurrent writers).
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
        // Presentational / integration surfaces: smoke + e2e, not branch gate.
        'packages/web/src/App.tsx',
        'packages/web/src/SettingsShell.tsx',
        'packages/web/src/pages/**',
        'packages/web/src/cards/**',
        'packages/web/src/neopets-more/**',
        'packages/web/src/lib/pet-image-slug.ts',
        'packages/web/src/**/*App.tsx',
        'packages/web/src/**/*Modal.tsx',
        'packages/web/src/**/*Dialog.tsx',
        'packages/web/src/**/BrowseShell.tsx',
        'packages/web/src/**/CategoryBrowse.tsx',
        'packages/web/src/**/ColourIdentityBrowse.tsx',
        'packages/web/src/**/MasonryColumns.tsx',
        'packages/web/src/**/CardTile.tsx',
        'packages/web/src/**/CardFace.tsx',
        'packages/web/src/**/LibraryView.tsx',
        'packages/web/src/**/SwapQueuePanel.tsx',
        'packages/web/src/**/DbMenu.tsx',
        'packages/web/src/**/FormatBadge.tsx',
        'packages/web/src/**/ExportBar.tsx',
        'packages/web/src/**/DeckActionsMenu.tsx',
        'packages/web/src/**/MoveSheet.tsx',
        'packages/web/src/**/DragMove.tsx',
        'packages/web/src/**/OrderReconcile*.tsx',
        'packages/web/src/**/DeckReview*.tsx',
        'packages/web/src/**/DeckSuggest*.tsx',
        'packages/web/src/**/Suggestion*.tsx',
        'packages/web/src/dailies/DailiesApp.tsx',
        'packages/web/src/dailies/icons.ts',
        'packages/web/src/deck-builder/ui/**',
        'packages/web/src/deck-builder/card-size.ts',
        // Coverage backlog (large bridge/export surfaces). Tracked in AGENTS.md;
        // reported via `npm run test:coverage:full`, not the 80% gate.
        'packages/web/src/mtg/archidekt-export.ts',
        'packages/web/src/mtg/order-reconcile-export.ts',
        'packages/web/src/mtg/profile-sync.ts',
        'packages/web/src/dailies/itemdb.ts',
        'packages/web/src/deck-suggest/generation.ts',
      ],
      thresholds: {
        branches: 80,
      },
    },
    fileParallelism: false,
  },
});
