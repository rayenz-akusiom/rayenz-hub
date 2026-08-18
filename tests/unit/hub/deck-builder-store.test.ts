/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import commander from '../../fixtures/deck-builder/commander-slice.json';
import type { DeckDocument } from '@rayenz-hub/shared';

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
    const saved = await saveDeck({ ...commander, deckId: 'store-test' } as DeckDocument);
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
    await saveDeck({ ...commander, deckId: 'cover-test' } as DeckDocument);
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

  it('treats untagged local decks as sandbox and purges them after 30 days', async () => {
    const { __putDeckForTests, getDeck, listDecks } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    const { purgeExpiredSandboxDecks } = await import(
      '../../../packages/web/src/deck-builder/store/library-sync.ts'
    );
    const { getLocalLibraryScope } = await import(
      '../../../packages/web/src/deck-builder/store/local-library-scope.ts'
    );

    await __putDeckForTests({
      ...commander,
      deckId: 'old-untagged',
      updatedAt: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
    } as DeckDocument);
    expect(getLocalLibraryScope('old-untagged')).toBe('sandbox');

    await purgeExpiredSandboxDecks(Date.parse('2026-08-17T00:00:00.000Z'));
    expect(await getDeck('old-untagged')).toBeNull();
    expect((await listDecks()).some((d) => d.deckId === 'old-untagged')).toBe(false);
  });
});
