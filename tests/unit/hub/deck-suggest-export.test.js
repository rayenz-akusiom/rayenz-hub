import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadHubModule, resetHubModules, REPO_ROOT } from '../helpers/hubHarness.js';

const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/fixtures/deck-suggest');

const MODULES = [
   'shared/storage.js',
   'shared/hub-utils.js',
   'shared/scryfall-cache.js',
   'shared/swap-queue.js',
   'shared/suggestions-bundle.js',
   'apps/deck-review/archidekt-export.js',
   'apps/deck-review/deck-review.js',
   'apps/order-reconcile/order-reconcile-export.js',
   'apps/deck-suggest/deck-suggest.js',
   'apps/deck-suggest/ds-rules-roles.js',
   'apps/deck-suggest/ds-tagger.js',
   'apps/deck-suggest/ds-rules-queue.js',
   'apps/deck-suggest/ds-rules-proxy.js',
   'apps/deck-suggest/ds-rules.js',
   'apps/deck-suggest/ds-data.js',
   'apps/deck-suggest/ds-export.js',
];

let DS;
let DR;

function loadFixture(name) {
   return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

beforeEach(() => {
   resetHubModules();
   loadHubModule(MODULES);
   DS = window.DeckSuggest;
   DR = window.DeckReview;
   DS.state.setScope = loadFixture('set-msh-slice.json');
   const deck = loadFixture('baird-snapshot.json');
   const output = DS.runRulesForDeck(deck, DS.state.setScope, {});
   DS.state.generationRun = {
      deckResults: [{
         deck: deck,
         suggestions: output.suggestions,
         analysis: output.analysis,
         audit: output.audit,
      }],
   };
});

afterEach(() => {
   resetHubModules();
});

describe('deck-suggest export', () => {
   it('builds schema 1.1 JSON that Deck Review accepts', () => {
      const exported = DS.Export.buildExport(DS.state);
      const validated = DR.validateSuggestions(exported);
      expect(validated.meta.schema_version).toBe('1.1');
      expect(validated.meta.notes).toContain('Deck Suggest');
      expect(validated.decks[0].suggestions.length).toBeGreaterThan(0);
   });

   it('buildSummary aggregates deck results', () => {
      const summary = DS.Export.buildSummary(DS.state);
      expect(summary).not.toBe(null);
      expect(summary.totalSuggestions).toBeGreaterThan(0);
      expect(summary.deckRows).toHaveLength(1);
      expect(summary.poolSize).toBe(DS.state.setScope.cards.length);
   });

   it('hasReviewableSuggestions is true when export has suggestions', () => {
      expect(DS.Export.hasReviewableSuggestions(DS.state)).toBe(true);
   });

   it('hasReviewableSuggestions is false without generation run', () => {
      DS.state.generationRun = null;
      expect(DS.Export.hasReviewableSuggestions(DS.state)).toBe(false);
   });

   it('buildExport retains deck_snapshot from generation', () => {
      const exported = DS.Export.buildExport(DS.state);
      expect(exported.decks[0].deck_snapshot).toBeTruthy();
      expect(exported.decks[0].deck_snapshot.cards.length).toBeGreaterThan(0);
      expect(exported.decks[0].deck_snapshot.fetched_at).toBe('2026-06-22');
   });
});
