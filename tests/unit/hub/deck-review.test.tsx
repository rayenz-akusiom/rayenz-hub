import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveReviewHandoff } from '../../../packages/web/src/lib/hub-storage.ts';
import { suggestionsExportFilename, handoffSnapshotSummary } from '../../../packages/web/src/lib/hub-utils.ts';
import {
  DeckReview,
  acceptedForDeck,
  applyLoadedSuggestions,
  createInitialReviewState,
  loadSuggestionsData,
  refreshAllDecksLabel,
  showDownloadJson,
  validateSuggestions,
} from '../../../packages/web/src/deck-review/index.ts';
import { DeckReviewApp } from '../../../packages/web/src/deck-review/DeckReviewApp.tsx';
import { resetHubModules } from '../helpers/hubHarness.ts';

function deckWithSnapshot() {
  return {
    deck_id: 'd1',
    deck_name: 'Test Deck',
    archidekt_url: 'https://archidekt.com/decks/12345/test',
    profile_preferences: { blocked_cards: ['Blocked Card'], protected_cards: ['Sol Ring'] },
    suggestions: [
      {
        suggestion_id: 's1',
        priority_tier: 'swap',
        confidence: 'high',
        action: 'replace',
        card: { name: 'New Card', set_code: 'NIN', collector_number: '1', scryfall_id: 'sf-1' },
        replaces: [{ name: 'Old Card' }],
        roles_matched: ['ramp'],
        rationale: 'better',
      },
    ],
    deck_snapshot: {
      fetched_at: '2026-01-01',
      cards: [
        { name: 'New Card', primary_category: 'Queued In', set_code: 'nin', collector_number: '1' },
        { name: 'Old Card', primary_category: 'Queued Out', set_code: 'old', collector_number: '2' },
        { name: 'Sol Ring', primary_category: 'Ramp', set_code: 'cmm', collector_number: '3' },
        { name: 'Cut Me', primary_category: 'Ramp', set_code: 'cmm', collector_number: '4' },
      ],
    },
  };
}

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
  document.body.innerHTML = '';
});

describe('DeckReview module wiring', () => {
  it('exposes core, data, picker, profile, and decision functions', () => {
    expect(typeof DeckReview.deriveSwapQueue).toBe('function');
    expect(typeof DeckReview.deckCutOptions).toBe('function');
    expect(typeof DeckReview.getDeckPreferences).toBe('function');
    expect(typeof DeckReview.decisionStatusLabel).toBe('function');
    expect(typeof validateSuggestions).toBe('function');
  });
});

describe('DeckReview.deriveSwapQueue', () => {
  it('splits snapshot cards into Queued In/Out', () => {
    const queue = DeckReview.deriveSwapQueue(deckWithSnapshot());
    expect(queue!.new_set_in.map((c) => c.name)).toEqual(['New Card']);
    expect(queue!.new_set_out.map((c) => c.name)).toEqual(['Old Card']);
  });

  it('returns null without a snapshot', () => {
    expect(DeckReview.deriveSwapQueue({ deck_id: 'x' })).toBe(null);
  });
});

describe('DeckReview.getSuggestionStaleness', () => {
  it('flags suggestions already in the queue as fully queued', () => {
    const deck = deckWithSnapshot();
    const stale = DeckReview.getSuggestionStaleness(deck, deck.suggestions![0]);
    expect(stale.stale).toBe(true);
    expect(stale.level).toBe('fully_queued');
  });
});

describe('DeckReview.deckCutOptions', () => {
  it('excludes swap-queue cards and includes regular cards', () => {
    const names = DeckReview.deckCutOptions(deckWithSnapshot()).map((o) => o.name);
    expect(names).toContain('Sol Ring');
    expect(names).toContain('Cut Me');
    expect(names).not.toContain('New Card');
  });
});

describe('DeckReview.getDeckPreferences / isSuggestionFiltered', () => {
  it('merges profile preferences and filters blocked/protected suggestions', () => {
    const deck = deckWithSnapshot();
    const prefs = DeckReview.getDeckPreferences(deck, {});
    expect(prefs.blocked_cards).toContain('Blocked Card');
    expect(prefs.protected_cards).toContain('Sol Ring');

    const blocked = { card: { name: 'Blocked Card' }, replaces: [] };
    const protectedOut = { card: { name: 'Fine' }, replaces: [{ name: 'Sol Ring' }] };
    const ok = { card: { name: 'Fine' }, replaces: [{ name: 'Whatever' }] };
    expect(DeckReview.isSuggestionFiltered(blocked, prefs)).toBe(true);
    expect(DeckReview.isSuggestionFiltered(protectedOut, prefs)).toBe(true);
    expect(DeckReview.isSuggestionFiltered(ok, prefs)).toBe(false);
  });
});

describe('DeckReview.decisionStatusLabel / isMissingSuggestedCut', () => {
  it('returns status label markup', () => {
    expect(DeckReview.decisionStatusLabel('accepted')).toContain('Accepted');
    expect(DeckReview.decisionStatusLabel('pending')).toContain('Pending');
    expect(DeckReview.decisionStatusLabel('')).toBe('');
  });

  it('detects missing cuts for non-sideboard suggestions', () => {
    expect(DeckReview.isMissingSuggestedCut({ action: 'replace', replaces: [] })).toBe(true);
    expect(DeckReview.isMissingSuggestedCut({ action: 'replace', replaces: [{ name: 'X' }] })).toBe(false);
    expect(DeckReview.isMissingSuggestedCut({ action: 'sideboard', replaces: [] })).toBe(false);
  });
});

describe('DeckReview.validateSuggestions', () => {
  it('normalizes string roles_matched to an array', () => {
    const data = {
      meta: { schema_version: '1.1' },
      decks: [{
        deck_id: 'd1',
        suggestions: [{
          suggestion_id: 's1',
          roles_matched: 'swap',
          replaces: { name: 'Old Card' },
        }],
      }],
    };
    const validated = validateSuggestions(data);
    expect(validated.decks[0].suggestions![0].roles_matched).toEqual(['swap']);
    expect(Array.isArray(validated.decks[0].suggestions![0].replaces)).toBe(true);
  });
});

describe('DeckReview.acceptedForDeck', () => {
  it('collects accepted swap payloads from progress', () => {
    const deck = deckWithSnapshot();
    const progress = {
      decisions: {
        s1: { status: 'accepted', accepted: { card_in: { name: 'New Card' } } },
      },
      currentDeckId: null,
      currentSuggestionIndex: {},
    };
    const accepted = acceptedForDeck(deck, progress);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].card_in.name).toBe('New Card');
  });
});

describe('DeckReview handoff and transferSource', () => {
  const sampleData = {
    meta: { schema_version: '1.1', set_code: 'MSH', set_name: 'MSH', generated_at: '2026-06-30' },
    decks: [{
      deck_id: 'd1',
      deck_name: 'Test',
      suggestions: [{
        suggestion_id: 's1',
        priority_tier: 'swap',
        confidence: 'high',
        action: 'replace',
        card: { name: 'Card', set_code: 'MSH', collector_number: '1' },
        replaces: [],
      }],
    }],
  };

  it('loadSuggestionsData loads validated data', async () => {
    const next = await loadSuggestionsData(createInitialReviewState(), sampleData);
    expect(next.data!.decks).toHaveLength(1);
    expect(next.fileId).toBe('MSH-2026-06-30');
  });

  it('showDownloadJson is true when transferSource is deck-suggest', () => {
    expect(showDownloadJson('deck-suggest')).toBe(true);
    expect(showDownloadJson('upload')).toBe(false);
  });

  it('refreshAllDecksLabel relabels for deck-suggest handoff', () => {
    expect(refreshAllDecksLabel('deck-suggest')).toBe('Refresh from Archidekt (optional)');
    expect(refreshAllDecksLabel('upload')).toBe('Refresh all decks');
  });

  it('handoff with snapshots is reported as all ready', () => {
    const data = {
      decks: [{
        deck_snapshot: { cards: [{ name: 'Sol Ring' }] },
        suggestions: [{ suggestion_id: 's1' }],
      }],
    };
    expect(handoffSnapshotSummary(data).allReady).toBe(true);
  });

  it('loadSuggestionsData preserves deck_snapshot from handoff payload', async () => {
    const dataWithSnapshot = {
      meta: { schema_version: '1.1', set_code: 'MSH', set_name: 'MSH', generated_at: '2026-06-30' },
      decks: [{
        deck_id: 'd1',
        deck_name: 'Test',
        deck_snapshot: { fetched_at: '2026-06-22', cards: [{ name: 'Sol Ring', primary_category: 'Ramp' }] },
        suggestions: [{
          suggestion_id: 's1',
          priority_tier: 'swap',
          confidence: 'high',
          action: 'replace',
          card: { name: 'Card', set_code: 'MSH', collector_number: '1' },
          replaces: [],
        }],
      }],
    };
    const next = await loadSuggestionsData(createInitialReviewState(), dataWithSnapshot);
    expect(next.data!.decks[0].deck_snapshot!.cards).toHaveLength(1);
    expect(next.data!.decks[0].deck_snapshot!.fetched_at).toBe('2026-06-22');
  });

  it('DeckReviewApp loads handoff without fetching latest.json', async () => {
    saveReviewHandoff({
      data: sampleData,
      source: 'deck-suggest',
      savedAt: '2026-06-30T12:00:00.000Z',
    });
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }));
    global.fetch = fetchSpy;

    render(<DeckReviewApp />);

    await waitFor(() => {
      expect(document.getElementById('dr-content')).toBeTruthy();
    });

    const latestCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).indexOf('latest.json') >= 0);
    expect(latestCalls).toHaveLength(0);
  });
});

describe('HubUtils suggestions download', () => {
  it('builds export filename from meta', () => {
    const name = suggestionsExportFilename({
      meta: { set_code: 'msh', generated_at: '2026-06-30' },
    });
    expect(name).toBe('MSH-2026-06-30-rules.json');
  });
});

describe('applyLoadedSuggestions', () => {
  it('sets active deck from progress', () => {
    const data = {
      meta: { schema_version: '1.1', set_code: 'X', generated_at: '2026-01-01' },
      decks: [{ deck_id: 'd1', suggestions: [] }, { deck_id: 'd2', suggestions: [] }],
    };
    const validated = validateSuggestions(data);
    const progress = {
      decisions: {},
      currentDeckId: 'd2',
      currentSuggestionIndex: { d2: 3 },
    };
    const next = applyLoadedSuggestions(createInitialReviewState(), validated, progress);
    expect(next.activeDeckId).toBe('d2');
    expect(next.suggestionIndex).toBe(3);
  });
});
