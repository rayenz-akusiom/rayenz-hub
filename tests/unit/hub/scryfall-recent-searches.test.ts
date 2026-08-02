import { afterEach, describe, expect, it } from 'vitest';
import {
  loadRecentScryfallSearches,
  rememberScryfallSearch,
} from '../../../packages/web/src/deck-builder/scryfall/recent-searches.ts';

const KEY = 'rayenz-scryfall-recent-searches';

afterEach(() => {
  localStorage.removeItem(KEY);
});

describe('recent Scryfall searches', () => {
  it('stores newest query first and dedupes case-insensitively', () => {
    expect(rememberScryfallSearch('sol ring')).toEqual(['sol ring']);
    expect(rememberScryfallSearch('Counterspell')).toEqual(['Counterspell', 'sol ring']);
    expect(rememberScryfallSearch('SOL RING')).toEqual(['SOL RING', 'Counterspell']);
    expect(loadRecentScryfallSearches()).toEqual(['SOL RING', 'Counterspell']);
  });

  it('caps history at 10 entries', () => {
    for (let i = 0; i < 12; i++) {
      rememberScryfallSearch(`q${i}`);
    }
    expect(loadRecentScryfallSearches()).toHaveLength(10);
    expect(loadRecentScryfallSearches()[0]).toBe('q11');
    expect(loadRecentScryfallSearches()).not.toContain('q0');
  });
});
