import { afterEach, describe, expect, it } from 'vitest';
import {
  loadRecentScryfallSearches,
  rememberScryfallSearch,
} from '../../../packages/web/src/deck-builder/scryfall/recent-searches.ts';
import {
  loadScryfallSearchExpanded,
  saveScryfallSearchExpanded,
} from '../../../packages/web/src/deck-builder/scryfall/search-expanded.ts';
import {
  loadScryfallQuickAddPref,
  parseScryfallQuickAddPref,
  saveScryfallQuickAddPref,
} from '../../../packages/web/src/deck-builder/scryfall/quick-add-pref.ts';

const KEY = 'rayenz-scryfall-recent-searches';
const EXPANDED_KEY = 'rayenz-scryfall-search-expanded';
const QUICK_ADD_KEY = 'rayenz-scryfall-quick-add';

afterEach(() => {
  localStorage.removeItem(KEY);
  localStorage.removeItem(EXPANDED_KEY);
  localStorage.removeItem(QUICK_ADD_KEY);
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

describe('Scryfall quick add preference', () => {
  it('defaults to Default and round-trips', () => {
    expect(loadScryfallQuickAddPref()).toEqual({ kind: 'default' });
    saveScryfallQuickAddPref({ kind: 'maybeboard' });
    expect(loadScryfallQuickAddPref()).toEqual({ kind: 'maybeboard' });
    saveScryfallQuickAddPref({ kind: 'category', name: 'Creatures' });
    expect(loadScryfallQuickAddPref()).toEqual({ kind: 'category', name: 'Creatures' });
    saveScryfallQuickAddPref({ kind: 'off' });
    expect(loadScryfallQuickAddPref()).toEqual({ kind: 'off' });
  });

  it('falls back to Default for invalid storage', () => {
    expect(parseScryfallQuickAddPref(null)).toEqual({ kind: 'default' });
    expect(parseScryfallQuickAddPref({ kind: 'nope' })).toEqual({ kind: 'default' });
    expect(parseScryfallQuickAddPref({ kind: 'category', name: '  ' })).toEqual({
      kind: 'default',
    });
    localStorage.setItem(QUICK_ADD_KEY, 'not-json');
    expect(loadScryfallQuickAddPref()).toEqual({ kind: 'default' });
  });
});
