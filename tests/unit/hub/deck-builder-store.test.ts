/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import commander from '../../fixtures/deck-builder/commander-slice.json';

describe('deck-store local persistence', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { __resetMemoryStoreForTests } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    __resetMemoryStoreForTests();
  });

  it('saves and reloads a deck without network', async () => {
    const { saveDeck, getDeck, listDecks, deleteDeck } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    const saved = await saveDeck({ ...commander, deckId: 'store-test' });
    expect(saved.deckId).toBe('store-test');
    const loaded = await getDeck('store-test');
    expect(loaded?.name).toBe(commander.name);
    const list = await listDecks();
    expect(list.some((d) => d.deckId === 'store-test')).toBe(true);
    await deleteDeck('store-test');
    expect(await getDeck('store-test')).toBeNull();
  });

  it('returns empty library for invalid localStorage index', async () => {
    localStorage.setItem('rayenz-deck-builder-library', 'not-json');
    const { readLibraryIndex, listDecks } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    expect(readLibraryIndex()).toEqual([]);
    expect(await listDecks()).toEqual([]);
  });

  it('rebuilds summaries missing cover fields from stored decks', async () => {
    const { saveDeck, listDecks, readLibraryIndex } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    await saveDeck({ ...commander, deckId: 'cover-test' });
    const stale = readLibraryIndex().map((s) => ({
      ...s,
      coverImageUrl: null,
      coverImageUrlSecondary: undefined,
      coverPartnerStatus: undefined,
      coverCardName: undefined,
    }));
    localStorage.setItem('rayenz-deck-builder-library', JSON.stringify(stale));

    const list = await listDecks();
    expect(list.some((d) => d.deckId === 'cover-test' && d.coverImageUrl)).toBe(true);
    expect(list.some((d) => d.deckId === 'cover-test' && d.coverCardName)).toBe(true);
  });

  it('mergeDeckDocuments prefers newer updatedAt', async () => {
    const { mergeDeckDocuments } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    const local = { ...commander, deckId: 'merge', updatedAt: '2026-01-01T00:00:00.000Z' };
    const remote = { ...commander, deckId: 'merge', updatedAt: '2026-02-01T00:00:00.000Z', name: 'Remote wins' };
    expect(mergeDeckDocuments(null, remote)?.name).toBe('Remote wins');
    expect(mergeDeckDocuments(local, null)?.name).toBe(commander.name);
    expect(mergeDeckDocuments(local, remote)?.name).toBe('Remote wins');
    expect(mergeDeckDocuments(remote, local)?.name).toBe('Remote wins');
  });
});
