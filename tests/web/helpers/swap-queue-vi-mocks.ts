/**
 * Side-effect mock registration for SwapQueueApp suites.
 * Import this module before SwapQueueApp in each swap-queue test file.
 */
import { vi } from 'vitest';
import type { DeckDocument } from '@rayenz-hub/shared';
import {
  mockLoadSwapWantSources,
  mockPullRemoteLibraryUpdates,
  mockSaveDeck,
} from './swap-queue-harness';

vi.mock('../../../packages/web/src/swap-queue/aggregate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../packages/web/src/swap-queue/aggregate')>();
  return {
    ...actual,
    loadSwapWantSources: () => mockLoadSwapWantSources(),
  };
});

vi.mock('../../../packages/web/src/deck-builder/store/deck-store', () => ({
  saveDeck: (doc: DeckDocument) => mockSaveDeck(doc),
  reconcileDeckAfterApiPut: (local: DeckDocument) => local,
}));

vi.mock('../../../packages/web/src/deck-builder/store/library-sync', () => ({
  pullRemoteLibraryUpdates: () => mockPullRemoteLibraryUpdates(),
}));

vi.mock('../../../packages/web/src/swap-queue/enrich-prices', () => ({
  enrichWantSourcesUsd: async (sources: unknown) => sources,
}));
