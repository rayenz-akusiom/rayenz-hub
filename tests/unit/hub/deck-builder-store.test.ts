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
});
