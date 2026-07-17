import fs from 'fs';
import path from 'path';
import { validatePayload } from '@rayenz-hub/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Export, runRulesForDeck } from '../../../packages/web/src/deck-suggest/index.ts';
import { resetHubModules, REPO_ROOT } from '../helpers/hubHarness.ts';

const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/fixtures/deck-suggest');

function loadFixture(name: string) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('deck-suggest export', () => {
  it('builds schema 1.1 JSON that Deck Review accepts', () => {
    const setScope = loadFixture('set-msh-slice.json');
    const deck = loadFixture('baird-snapshot.json');
    const output = runRulesForDeck(deck, setScope, {});
    const state = {
      setScope,
      generationRun: {
        deckResults: [
          {
            deck,
            suggestions: output.suggestions,
            analysis: output.analysis,
            audit: output.audit,
          },
        ],
      },
    };
    const exported = Export.buildExport(state);
    const validated = validatePayload(exported);
    expect(validated.meta.schema_version).toBe('1.1');
    expect(validated.meta.notes).toContain('Deck Suggest');
    expect(validated.decks[0].suggestions.length).toBeGreaterThan(0);
  });

  it('buildSummary aggregates deck results', () => {
    const setScope = loadFixture('set-msh-slice.json');
    const deck = loadFixture('baird-snapshot.json');
    const output = runRulesForDeck(deck, setScope, {});
    const state = {
      setScope,
      generationRun: {
        deckResults: [{ deck, suggestions: output.suggestions, analysis: output.analysis, audit: output.audit }],
      },
    };
    const summary = Export.buildSummary(state);
    expect(summary).not.toBe(null);
    expect(summary!.totalSuggestions).toBeGreaterThan(0);
    expect(summary!.deckRows).toHaveLength(1);
    expect(summary!.poolSize).toBe(setScope.cards.length);
  });

  it('hasReviewableSuggestions is true when export has suggestions', () => {
    const setScope = loadFixture('set-msh-slice.json');
    const deck = loadFixture('baird-snapshot.json');
    const output = runRulesForDeck(deck, setScope, {});
    const state = {
      setScope,
      generationRun: {
        deckResults: [{ deck, suggestions: output.suggestions, analysis: output.analysis, audit: output.audit }],
      },
    };
    expect(Export.hasReviewableSuggestions(state)).toBe(true);
  });

  it('hasReviewableSuggestions is false without generation run', () => {
    expect(Export.hasReviewableSuggestions({ setScope: null, generationRun: null })).toBe(false);
  });

  it('buildExport retains deck_snapshot from generation', () => {
    const setScope = loadFixture('set-msh-slice.json');
    const deck = loadFixture('baird-snapshot.json');
    const output = runRulesForDeck(deck, setScope, {});
    const state = {
      setScope,
      generationRun: {
        deckResults: [{ deck, suggestions: output.suggestions, analysis: output.analysis, audit: output.audit }],
      },
    };
    const exported = Export.buildExport(state);
    expect(exported.decks[0].deck_snapshot).toBeTruthy();
    expect(exported.decks[0].deck_snapshot!.cards!.length).toBeGreaterThan(0);
    expect(exported.decks[0].deck_snapshot!.fetched_at).toBe('2026-06-22');
  });
});
