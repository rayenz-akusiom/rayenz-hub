import { afterEach, describe, expect, it } from 'vitest';
import {
  loadRecentScryfallSearches,
  rememberScryfallSearch,
} from '../../../packages/web/src/deck-builder/scryfall/recent-searches.ts';
import {
  loadScryfallSearchExpanded,
  saveScryfallSearchExpanded,
} from '../../../packages/web/src/deck-builder/scryfall/search-expanded.ts';

const KEY = 'rayenz-scryfall-recent-searches';
const EXPANDED_KEY = 'rayenz-scryfall-search-expanded';

afterEach(() => {
  localStorage.removeItem(KEY);
  localStorage.removeItem(EXPANDED_KEY);
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

describe('Scryfall search expanded preference', () => {
  it('defaults to collapsed and round-trips', () => {
    expect(loadScryfallSearchExpanded()).toBe(false);
    saveScryfallSearchExpanded(true);
    expect(loadScryfallSearchExpanded()).toBe(true);
    saveScryfallSearchExpanded(false);
    expect(loadScryfallSearchExpanded()).toBe(false);
  });
});
