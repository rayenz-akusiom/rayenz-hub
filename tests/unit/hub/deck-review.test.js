import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadHubModule, resetHubModules } from '../helpers/hubHarness.js';

let DR;

const FILES = [
   'shared/storage.js',
   'shared/hub-utils.js',
   'shared/scryfall-cache.js',
   'shared/swap-queue.js',
   'shared/suggestions-bundle.js',
   'shared/cut-candidates.js',
   'apps/deck-review/archidekt-export.js',
   'apps/deck-review/profile-sync.js',
   'apps/deck-review/deck-review.js',
   'apps/deck-review/dr-data.js',
   'apps/deck-review/dr-pickers.js',
   'apps/deck-review/dr-profiles.js',
   'apps/deck-review/dr-decisions.js',
   'apps/deck-review/dr-render.js',
];

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
            { name: 'New Card', primary_category: 'New Set In', set_code: 'nin', collector_number: '1' },
            { name: 'Old Card', primary_category: 'New Set Out', set_code: 'old', collector_number: '2' },
            { name: 'Sol Ring', primary_category: 'Ramp', set_code: 'cmm', collector_number: '3' },
            { name: 'Cut Me', primary_category: 'Ramp', set_code: 'cmm', collector_number: '4' },
         ],
      },
   };
}

beforeEach(() => {
   resetHubModules();
   DR = loadHubModule(FILES, 'DeckReview');
});

afterEach(() => {
   resetHubModules();
});

describe('DeckReview module wiring', () => {
   it('exposes core, data, picker, profile, decision, and render functions', () => {
      expect(typeof DR.getDeckById).toBe('function');
      expect(typeof DR.deriveSwapQueue).toBe('function');
      expect(typeof DR.deckCutOptions).toBe('function');
      expect(typeof DR.getDeckPreferences).toBe('function');
      expect(typeof DR.recordSuggestionDecision).toBe('function');
      expect(typeof DR.renderSuggestionPanel).toBe('function');
      expect(typeof window.loadDeckReviewApp).toBe('function');
   });
});

describe('DeckReview.deriveSwapQueue', () => {
   it('splits snapshot cards into New Set In/Out', () => {
      const queue = DR.deriveSwapQueue(deckWithSnapshot());
      expect(queue.new_set_in.map((c) => c.name)).toEqual(['New Card']);
      expect(queue.new_set_out.map((c) => c.name)).toEqual(['Old Card']);
   });

   it('returns null without a snapshot', () => {
      expect(DR.deriveSwapQueue({ deck_id: 'x' })).toBe(null);
   });
});

describe('DeckReview.getSuggestionStaleness', () => {
   it('flags suggestions already in the queue as fully queued', () => {
      const deck = deckWithSnapshot();
      const stale = DR.getSuggestionStaleness(deck, deck.suggestions[0]);
      expect(stale.stale).toBe(true);
      expect(stale.level).toBe('fully_queued');
   });
});

describe('DeckReview.deckCutOptions', () => {
   it('excludes swap-queue cards and includes regular cards', () => {
      const names = DR.deckCutOptions(deckWithSnapshot()).map((o) => o.name);
      expect(names).toContain('Sol Ring');
      expect(names).toContain('Cut Me');
      expect(names).not.toContain('New Card');
   });
});

describe('DeckReview.getDeckPreferences / isSuggestionFiltered', () => {
   it('merges profile preferences and filters blocked/protected suggestions', () => {
      const deck = deckWithSnapshot();
      DR.state.deckPrefs = {};
      const prefs = DR.getDeckPreferences(deck);
      expect(prefs.blocked_cards).toContain('Blocked Card');
      expect(prefs.protected_cards).toContain('Sol Ring');

      const blocked = { card: { name: 'Blocked Card' }, replaces: [] };
      const protectedOut = { card: { name: 'Fine' }, replaces: [{ name: 'Sol Ring' }] };
      const ok = { card: { name: 'Fine' }, replaces: [{ name: 'Whatever' }] };
      expect(DR.isSuggestionFiltered(blocked, prefs)).toBe(true);
      expect(DR.isSuggestionFiltered(protectedOut, prefs)).toBe(true);
      expect(DR.isSuggestionFiltered(ok, prefs)).toBe(false);
   });
});

describe('DeckReview.decisionStatusLabel / isMissingSuggestedCut', () => {
   it('returns status label markup', () => {
      expect(DR.decisionStatusLabel('accepted')).toContain('Accepted');
      expect(DR.decisionStatusLabel('pending')).toContain('Pending');
      expect(DR.decisionStatusLabel('')).toBe('');
   });

   it('detects missing cuts for non-sideboard suggestions', () => {
      expect(DR.isMissingSuggestedCut({ action: 'replace', replaces: [] })).toBe(true);
      expect(DR.isMissingSuggestedCut({ action: 'replace', replaces: [{ name: 'X' }] })).toBe(false);
      expect(DR.isMissingSuggestedCut({ action: 'sideboard', replaces: [] })).toBe(false);
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
      const validated = DR.validateSuggestions(data);
      expect(validated.decks[0].suggestions[0].roles_matched).toEqual(['swap']);
      expect(Array.isArray(validated.decks[0].suggestions[0].replaces)).toBe(true);
   });
});

describe('DeckReview.acceptedForDeck', () => {
   it('collects accepted swap payloads from progress', () => {
      const deck = deckWithSnapshot();
      DR.state.data = { decks: [deck] };
      DR.state.progress = {
         decisions: {
            s1: { status: 'accepted', accepted: { card_in: { name: 'New Card' } } },
         },
      };
      const accepted = DR.acceptedForDeck('d1');
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

   it('loadSuggestionsData loads validated data', () => {
      DR.state.ui = {
         metaEl: document.createElement('div'),
         emptyState: document.createElement('div'),
         content: document.createElement('div'),
         deckList: document.createElement('div'),
         suggestionPanel: document.createElement('div'),
         downloadJsonBtn: document.createElement('button'),
      };
      DR.renderDeckList = () => {};
      DR.renderSuggestionPanel = () => {};
      DR.renderProfilesNav = () => {};
      DR.loadSuggestionsData(sampleData);
      expect(DR.state.data.decks).toHaveLength(1);
      expect(DR.state.fileId).toBe('MSH-2026-06-30');
   });

   it('updateTransferNav shows download when transferSource is deck-suggest', () => {
      DR.state.transferSource = 'deck-suggest';
      DR.state.ui = { downloadJsonBtn: { hidden: true } };
      Object.defineProperty(DR.state.ui.downloadJsonBtn, 'hidden', {
         writable: true,
         value: true,
      });
      DR.updateTransferNav();
      expect(DR.state.ui.downloadJsonBtn.hidden).toBe(false);
   });

   it('updateTransferNav relabels refresh button for deck-suggest handoff', () => {
      DR.state.transferSource = 'deck-suggest';
      const btn = document.createElement('button');
      btn.textContent = 'Refresh all decks';
      DR.state.ui = { refreshAllDecksBtn: btn };
      DR.updateTransferNav();
      expect(btn.textContent).toBe('Refresh from Archidekt (optional)');
   });

   it('handoff with snapshots is reported as all ready', () => {
      const data = {
         decks: [{
            deck_snapshot: { cards: [{ name: 'Sol Ring' }] },
            suggestions: [{ suggestion_id: 's1' }],
         }],
      };
      expect(HubUtils.handoffSnapshotSummary(data).allReady).toBe(true);
   });

   it('loadSuggestionsData preserves deck_snapshot from handoff payload', () => {
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
      DR.state.ui = {
         metaEl: document.createElement('div'),
         emptyState: document.createElement('div'),
         content: document.createElement('div'),
         deckList: document.createElement('div'),
         suggestionPanel: document.createElement('div'),
         downloadJsonBtn: document.createElement('button'),
      };
      DR.renderDeckList = () => {};
      DR.renderSuggestionPanel = () => {};
      DR.renderProfilesNav = () => {};
      DR.loadSuggestionsData(dataWithSnapshot);
      expect(DR.state.data.decks[0].deck_snapshot.cards).toHaveLength(1);
      expect(DR.state.data.decks[0].deck_snapshot.fetched_at).toBe('2026-06-22');
   });

   it('loadDeckReviewApp loads handoff without fetching latest.json', async () => {
      HubStorage.saveReviewHandoff({
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

      DR.updateProfilesConnectionStatus = () => {};
      DR.renderProfilesNav = () => {};
      DR.renderDeckList = () => {};
      DR.renderSuggestionPanel = () => Promise.resolve();

      const root = document.createElement('div');
      document.body.appendChild(root);
      await window.loadDeckReviewApp(root);

      expect(DR.state.data.decks).toHaveLength(1);
      expect(DR.state.transferSource).toBe('deck-suggest');
      const latestCalls = fetchSpy.mock.calls.filter(function (call) {
         return String(call[0]).indexOf('latest.json') >= 0;
      });
      expect(latestCalls).toHaveLength(0);
      expect(document.getElementById('dr-content').hidden).toBe(false);
   });
});

describe('HubUtils suggestions download', () => {
   it('builds export filename from meta', () => {
      const name = HubUtils.suggestionsExportFilename({
         meta: { set_code: 'msh', generated_at: '2026-06-30' },
      });
      expect(name).toBe('MSH-2026-06-30-rules.json');
   });
});
