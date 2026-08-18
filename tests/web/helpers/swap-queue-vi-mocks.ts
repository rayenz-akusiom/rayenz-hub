/**
 * Side-effect mock registration for SwapQueueApp suites.
 * Import this module before SwapQueueApp in each swap-queue test file.
 */
import { vi } from 'vitest';
import type { DeckDocument } from '@rayenz-hub/shared';
import {
  mockLoadSwapWantSources,
  mockLoadPublicSwapWantSources,
  mockPullRemoteLibraryUpdates,
  mockSaveDeck,
} from './swap-queue-harness';

vi.mock('../../../packages/web/src/swap-queue/aggregate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../packages/web/src/swap-queue/aggregate')>();
  return {
    ...actual,
    loadSwapWantSources: () => mockLoadSwapWantSources(),
    loadPublicSwapWantSources: (...args: unknown[]) => mockLoadPublicSwapWantSources(...args),
  };
});

vi.mock('../../../packages/web/src/deck-builder/store/deck-store', () => ({
  saveDeck: (doc: DeckDocument) => mockSaveDeck(doc),
  reconcileDeckAfterApiPut: (local: DeckDocument) => local,
  readLibraryIndex: () => [],
  getDeck: async () => null,
  deleteDeck: async () => undefined,
}));

vi.mock('../../../packages/web/src/deck-builder/store/library-sync', () => ({
  pullRemoteLibraryUpdates: () => mockPullRemoteLibraryUpdates(),
}));

vi.mock('../../../packages/web/src/swap-queue/enrich-prices', () => ({
  enrichWantSourcesUsd: async (sources: unknown) => sources,
}));

vi.mock('../../../packages/web/src/swap-queue/fx-cad', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../packages/web/src/swap-queue/fx-cad')>();
  return {
    ...actual,
    fetchFxUsdCad: async () => ({ rate: 1.35, date: '2026-08-14' }),
  };
});
