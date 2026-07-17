import fs from 'fs';
import path from 'path';
import { validatePayload } from '@rayenz-hub/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectDebugEntries, Export, runRulesForDeck } from '../../../packages/web/src/deck-suggest/index.ts';
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

  it('buildExport throws when generation run is empty', () => {
    expect(() => Export.buildExport({ generationRun: null, setScope: null })).toThrow(/No generation results/);
    expect(() => Export.buildExport({ generationRun: { deckResults: [] }, setScope: null })).toThrow(
      /No generation results/,
    );
  });

  it('buildSummary counts skipped queue slots from audit rulesExecuted', () => {
    const setScope = loadFixture('set-msh-slice.json');
    const deck = loadFixture('baird-snapshot.json');
    const state = {
      setScope,
      generationRun: {
        deckResults: [{ deck, suggestions: [], skipped: true, skip_reason: 'not_in_set_scope' }],
        rulesExecuted: [{ skippedReason: 'Sunbillow Verge (not_in_set_scope)' }],
      },
    };
    const summary = Export.buildSummary(state);
    expect(summary!.skippedQueueSlots).toBe(1);
    expect(summary!.totalSuggestions).toBe(0);
  });

  it('hasReviewableSuggestions returns false when export would throw', () => {
    expect(Export.hasReviewableSuggestions({ generationRun: { deckResults: [] }, setScope: null })).toBe(false);
  });

  it('collectDebugEntries filters by card name', () => {
    const run = {
      deckResults: [
        {
          deck: { deck_id: 'd1', deck_name: 'Deck' },
          debugTrace: [
            { subject: 'Sunbillow Verge', reason: 'test' },
            { cardOut: 'Plains', reason: 'test' },
          ],
        },
      ],
    };
    expect(collectDebugEntries(run)).toHaveLength(2);
    expect(collectDebugEntries(run, 'plains')).toHaveLength(1);
    expect(collectDebugEntries(run, '   ')).toHaveLength(2);
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

  it('buildSummary includes deck error rows and downloadJson returns payload text', () => {
    const setScope = loadFixture('set-msh-slice.json');
    const deck = loadFixture('baird-snapshot.json');
    const state = {
      setScope,
      generationRun: {
        deckResults: [{
          deck,
          suggestions: [],
          skipped: true,
          error: 'fetch failed',
          message: 'Could not load',
        }],
      },
    };
    const summary = Export.buildSummary(state);
    expect(summary!.deckRows[0].error).toBe('fetch failed');
    expect(summary!.deckRows[0].message).toBe('Could not load');
  });

  it('downloadJson builds exportable payload', () => {
    const setScope = loadFixture('set-msh-slice.json');
    const deck = loadFixture('baird-snapshot.json');
    const output = runRulesForDeck(deck, setScope, {});
    const state = {
      setScope,
      generationRun: {
        deckResults: [{ deck, suggestions: output.suggestions, analysis: output.analysis, audit: output.audit }],
      },
    };
    const json = Export.downloadJson(state);
    expect(json).toContain('MSH');
  });
});
