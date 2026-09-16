/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import commander from '../../fixtures/deck-builder/commander-slice.json';

const resolveLibraryDocument = vi.hoisted(() =>
  vi.fn<(deckId: string) => Promise<DeckDocument | null>>(),
);

vi.mock('../../../packages/web/src/deck-builder/store/library-sync', () => ({
  listFallbackLibrary: async () => [],
  resolveLibraryDocument: (deckId: string) => resolveLibraryDocument(deckId),
}));

vi.mock('../../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiGetPublicSwaps: async () => null,
}));

function summary(over: Partial<DeckSummary> & Pick<DeckSummary, 'deckId' | 'name'>): DeckSummary {
  return {
    format: 'commander',
    ownership: 'owned',
    visibility: 'public',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archidektId: null,
    coverImageUrl: null,
    coverImageUrlSecondary: null,
    coverPartnerStatus: null,
    coverCardName: null,
    ...over,
  };
}

afterEach(() => {
  resolveLibraryDocument.mockReset();
});

describe('documentsForSummaries', () => {
  it('skips known-empty and theory decks; loads missing hasSwapEntries', async () => {
    const { documentsForSummaries } = await import(
      '../../../packages/web/src/swap-queue/aggregate.ts'
    );
    const withQueue = {
      ...commander,
      deckId: 'with-queue',
      lookingForEntries: [{ id: 'lf1', instanceId: 'c3', sortIndex: 0, notes: null }],
    } as DeckDocument;
    const legacy = { ...commander, deckId: 'legacy-unknown' } as DeckDocument;

    resolveLibraryDocument.mockImplementation(async (id) => {
      if (id === 'with-queue') return withQueue;
      if (id === 'legacy-unknown') return legacy;
      return null;
    });

    const decks = await documentsForSummaries([
      summary({ deckId: 'with-queue', name: 'Has Queue', hasSwapEntries: true }),
      summary({ deckId: 'empty', name: 'Empty', hasSwapEntries: false }),
      summary({ deckId: 'theory', name: 'Theory', ownership: 'theory', hasSwapEntries: true }),
      summary({ deckId: 'legacy-unknown', name: 'Legacy' }),
      summary({ deckId: 'cube-skip', name: 'Collection', format: 'collection', hasSwapEntries: true }),
    ]);

    expect(decks.map((d) => d.deckId).sort()).toEqual(['legacy-unknown', 'with-queue']);
    expect(resolveLibraryDocument).toHaveBeenCalledTimes(2);
    expect(resolveLibraryDocument).toHaveBeenCalledWith('with-queue');
    expect(resolveLibraryDocument).toHaveBeenCalledWith('legacy-unknown');
  });

  it('resolves candidates concurrently', async () => {
    const { documentsForSummaries } = await import(
      '../../../packages/web/src/swap-queue/aggregate.ts'
    );
    let active = 0;
    let maxActive = 0;
    resolveLibraryDocument.mockImplementation(async (id) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return { ...commander, deckId: id } as DeckDocument;
    });

    const summaries = Array.from({ length: 6 }, (_, i) =>
      summary({ deckId: `d${i}`, name: `D${i}`, hasSwapEntries: true }),
    );
    const decks = await documentsForSummaries(summaries);
    expect(decks).toHaveLength(6);
    expect(maxActive).toBeGreaterThan(1);
  });
});
