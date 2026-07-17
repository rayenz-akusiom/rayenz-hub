import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearDataSetPoolCache, tryRestoreSetPool } from '../../../packages/web/src/deck-suggest/data.ts';
import { HubStorage } from '../../../packages/web/src/lib/hub-storage.ts';
import { installHubGlobals, resetHubGlobalsInstalled } from '../../../packages/web/src/hub/install-hub-globals.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';
beforeEach(() => {
  resetHubModules();
  resetHubGlobalsInstalled();
  installHubGlobals();
});

afterEach(() => {
  resetHubModules();
  resetHubGlobalsInstalled();
});

describe('HubStorage review handoff', () => {
  it('roundtrips save and consume', () => {
    const payload = {
      data: { meta: { set_code: 'MSH', generated_at: '2026-06-30' }, decks: [] },
      source: 'deck-suggest',
      savedAt: '2026-06-30T12:00:00.000Z',
    };
    expect(HubStorage.saveReviewHandoff(payload)).toBe(true);
    const consumed = HubStorage.consumeReviewHandoff();
    expect(consumed).toEqual(payload);
  });

  it('returns null on second consume', () => {
    HubStorage.saveReviewHandoff({ data: { decks: [] }, source: 'deck-suggest' });
    HubStorage.consumeReviewHandoff();
    expect(HubStorage.consumeReviewHandoff()).toBe(null);
  });

  it('prefers in-memory handoff over sessionStorage', () => {
    const memoryPayload = {
      data: { meta: { set_code: 'MSH' }, decks: [{ deck_id: 'mem' }] },
      source: 'deck-suggest',
    };
    const sessionPayload = {
      data: { meta: { set_code: 'OLD' }, decks: [] },
      source: 'deck-suggest',
    };
    (window as Window & { __hubReviewHandoff?: unknown }).__hubReviewHandoff = memoryPayload;
    sessionStorage.setItem('rayenz-deck-suggest-review-handoff', JSON.stringify(sessionPayload));
    const consumed = HubStorage.consumeReviewHandoff();
    expect(consumed).toEqual(memoryPayload);
    expect((window as Window & { __hubReviewHandoff?: unknown }).__hubReviewHandoff).toBeUndefined();
    expect(sessionStorage.getItem('rayenz-deck-suggest-review-handoff')).toBe(null);
  });

  it('falls back to sessionStorage when memory handoff is absent', () => {
    const sessionPayload = {
      data: { meta: { set_code: 'MSH' }, decks: [] },
      source: 'deck-suggest',
    };
    sessionStorage.setItem('rayenz-deck-suggest-review-handoff', JSON.stringify(sessionPayload));
    expect(HubStorage.consumeReviewHandoff()).toEqual(sessionPayload);
  });
});

describe('HubStorage set pool cache', () => {
  it('saves and loads complete scopes only', () => {
    const scope = {
      complete: true,
      codes: ['MSH', 'MAR'],
      codesKey: 'MAR,MSH',
      cards: [{ name: 'Card A' }],
    };
    expect(HubStorage.saveSetPoolCache('MAR,MSH', scope)).toBe(true);
    expect(HubStorage.loadSetPoolCache('MAR,MSH')).toEqual(scope);
  });

  it('does not save incomplete scopes', () => {
    expect(HubStorage.saveSetPoolCache('MSH', { complete: false, cards: [] })).toBe(false);
    expect(HubStorage.loadSetPoolCache('MSH')).toBe(null);
  });

  it('clears cache by key', () => {
    const scope = { complete: true, codes: ['MSH'], codesKey: 'MSH', cards: [] };
    HubStorage.saveSetPoolCache('MSH', scope);
    HubStorage.clearSetPoolCache('MSH');
    expect(HubStorage.loadSetPoolCache('MSH')).toBe(null);
  });
});

describe('DeckSuggest tryRestoreSetPool', () => {
  it('restores from localStorage when memory cache is empty', () => {
    const scope = {
      complete: true,
      codes: ['MSH'],
      codesKey: 'MSH',
      cards: [{ name: 'A' }],
    };
    HubStorage.saveSetPoolCache('MSH', scope);
    clearDataSetPoolCache();
    const restored = tryRestoreSetPool('MSH');
    expect(restored?.codes).toEqual(scope.codes);
    expect(restored?.cards).toEqual(scope.cards);
    expect(restored?.indexVersion).toBe(1);
    expect(restored?.cardsByName?.a).toHaveLength(1);
  });
});