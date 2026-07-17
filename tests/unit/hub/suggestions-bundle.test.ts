import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SuggestionsBundle, SwapQueue } from '@rayenz-hub/shared';
import { resetHubModules } from '../helpers/hubHarness.ts';

function deckWithSnapshot() {
  return {
    deck_id: 'd1',
    deck_name: 'Test Deck',
    deck_snapshot: {
      cards: [
        { name: 'In Card', primary_category: 'Queued In' },
        { name: 'Out Card', primary_category: 'Queued Out' },
      ],
    },
    suggestions: [
      {
        suggestion_id: 's1',
        priority_tier: 'swap',
        confidence: 'high',
        replaces: 'Old Card',
        roles_matched: 'ramp',
      },
      {
        suggestion_id: 's2',
        priority_tier: 'normal',
        confidence: 'low',
        replaces: [],
        roles_matched: [],
      },
    ],
    profile_preferences: {
      protected_cards: 'Sol Ring',
      blocked_cards: null,
    },
  };
}

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('SuggestionsBundle.normalizeSuggestion', () => {
  it('coerces scalar replaces and roles_matched to arrays', () => {
    const normalized = SuggestionsBundle.normalizeSuggestion({
      suggestion_id: 's1',
      replaces: 'Cut Me',
      roles_matched: 'ramp',
    });
    expect(normalized?.replaces).toEqual(['Cut Me']);
    expect(normalized?.roles_matched).toEqual(['ramp']);
  });
});

describe('SuggestionsBundle.validatePayload', () => {
  it('normalizes decks and sorts suggestions', () => {
    const payload = SuggestionsBundle.validatePayload({
      meta: { schema_version: '1.1' },
      decks: [deckWithSnapshot()],
    });
    expect(payload.decks[0].suggestions?.[0].replaces).toEqual(['Old Card']);
    expect(payload.decks[0].profile_preferences?.protected_cards).toEqual(['Sol Ring']);
    expect(payload.decks[0].profile_preferences?.blocked_cards).toEqual([]);
    expect(payload.decks[0].suggestions?.[0].priority_tier).toBe('swap');
    expect(payload.decks[0].suggestions?.[1].priority_tier).toBe('normal');
  });

  it('rejects unsupported schema versions', () => {
    expect(() => SuggestionsBundle.validatePayload({ meta: { schema_version: '0.9' }, decks: [] })).toThrow(
      /schema_version/,
    );
  });
});

describe('SuggestionsBundle.getSwapQueue', () => {
  it('caches swap queue on the deck object', () => {
    const deck = deckWithSnapshot();
    const queue = SuggestionsBundle.getSwapQueue(deck);
    expect(queue?.new_set_in.map((c) => c.name)).toEqual(['In Card']);
    expect(deck._swapQueue).toBe(queue);
    expect(SuggestionsBundle.getSwapQueue(deck)).toBe(queue);
  });

  it('matches SwapQueue.deriveSwapQueue output', () => {
    const deck = deckWithSnapshot();
    expect(SuggestionsBundle.getSwapQueue(deck)).toEqual(SwapQueue.deriveSwapQueue(deck));
  });
});

describe('SuggestionsBundle.buildPayload', () => {
  it('builds export-ready schema 1.1 payload', () => {
    const payload = SuggestionsBundle.buildPayload({ schema_version: '1.1', set_code: 'MSH' }, [
      deckWithSnapshot(),
    ]);
    expect(payload.meta.schema_version).toBe('1.1');
    expect(payload.decks[0].suggestions?.[0].replaces).toEqual(['Old Card']);
    expect(payload.decks[0]._swapQueue).toBeTruthy();
  });
});
