import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadHubModule, resetHubModules } from '../helpers/hubHarness.js';

const DS_FILES = [
   'shared/storage.js',
   'shared/hub-utils.js',
   'shared/swap-queue.js',
   'apps/deck-review/archidekt-export.js',
   'apps/order-reconcile/order-reconcile-export.js',
   'apps/deck-suggest/deck-suggest.js',
   'apps/deck-suggest/ds-rules-roles.js',
   'apps/deck-suggest/ds-tagger.js',
   'apps/deck-suggest/ds-rules-queue.js',
   'apps/deck-suggest/ds-rules-proxy.js',
   'apps/deck-suggest/ds-rules.js',
   'apps/deck-suggest/ds-data.js',
];

let DS;

function sampleDeck() {
   return {
      deck_id: 'test-deck',
      deck_name: 'Test Deck',
      deck_snapshot: {
         cards: [
            { name: 'New Card', primary_category: 'New Set In' },
            { name: 'Cut Card', primary_category: 'New Set Out' },
            { name: 'Sol Ring', primary_category: 'Ramp', cmc: 1 },
            { name: 'Command Tower', primary_category: 'Land', cmc: 0 },
         ],
      },
   };
}

beforeEach(() => {
   resetHubModules();
   loadHubModule(DS_FILES, 'DeckSuggest');
   DS = window.DeckSuggest;
});

afterEach(() => {
   resetHubModules();
});

describe('DeckSuggest.Data.indexSetPool', () => {
   it('builds cardsByName index for O(1) pool lookups', () => {
      const scope = DS.Data.indexSetPool({
         primaryCode: 'MSH',
         codes: ['MSH'],
         cards: [
            { name: 'Sol Ring', set_code: 'MSH', collector_number: '1' },
            { name: 'Sol Ring', set_code: 'CMM', collector_number: '2' },
            { name: 'Lightning Bolt', set_code: 'MSH', collector_number: '3' },
         ],
      });
      expect(scope.indexVersion).toBe(1);
      expect(scope.cardsByName['sol ring']).toHaveLength(2);
      expect(scope.cardsByName['lightning bolt']).toHaveLength(1);
   });

   it('is idempotent when called twice', () => {
      const scope = DS.Data.indexSetPool({ cards: [{ name: 'Sol Ring' }] });
      const again = DS.Data.indexSetPool(scope);
      expect(again).toBe(scope);
      expect(again.cardsByName['sol ring']).toHaveLength(1);
   });
});

describe('DeckSuggest.Data.buildDeckRuleContext', () => {
   it('precomputes swap queue and deck name set', () => {
      const deck = sampleDeck();
      const ctx = DS.Data.buildDeckRuleContext(deck);
      expect(ctx.version).toBe(1);
      expect(ctx.swapQueue.new_set_in).toHaveLength(1);
      expect(ctx.swapQueue.new_set_in[0].name).toBe('New Card');
      expect(ctx.deckNames['sol ring']).toBe(true);
      expect(ctx.deckNames['new card']).toBe(true);
   });

   it('returns the same context on repeat calls', () => {
      const deck = sampleDeck();
      const first = DS.Data.buildDeckRuleContext(deck);
      const second = DS.Data.buildDeckRuleContext(deck);
      expect(second).toBe(first);
   });
});

describe('DeckSuggest precomputed rule pools', () => {
   it('findInSetPool uses cardsByName index', () => {
      const scope = DS.Data.indexSetPool({
         primaryCode: 'MSH',
         codes: ['MSH'],
         cards: [
            { name: 'Take Up the Shield', set_code: 'CMM', collector_number: '1' },
            { name: 'Take Up the Shield', set_code: 'MSH', collector_number: '2' },
         ],
      });
      const card = DS.RuleGuards.findInSetPool('Take Up the Shield', scope);
      expect(card.set_code).toBe('MSH');
   });

   it('caches cut candidates on deck.ruleContext', () => {
      const deck = sampleDeck();
      DS.Data.buildDeckRuleContext(deck);
      const first = DS.RuleGuards.cutCandidates(deck);
      const second = DS.RuleGuards.cutCandidates(deck);
      expect(second).toBe(first);
      expect(first.map((c) => c.name)).toEqual(['Sol Ring', 'Command Tower']);
   });

   it('runRulesForDeck precomputes pools before running rules', () => {
      const deck = sampleDeck();
      const setScope = DS.Data.indexSetPool({
         primaryCode: 'MSH',
         codes: ['MSH'],
         cards: [{ name: 'New Card', set_code: 'MSH', collector_number: '1' }],
      });
      DS.runRulesForDeck(deck, setScope, {});
      expect(deck.ruleContext.cutCandidates).toBeTruthy();
      expect(setScope.cardsByName).toBeTruthy();
   });
});
