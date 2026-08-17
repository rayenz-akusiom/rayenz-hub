import { describe, expect, it } from 'vitest';
import { nextActionableSuggestion } from '../../../packages/web/src/deck-suggest/session-queue';
import type { GenerationRun, Suggestion } from '../../../packages/web/src/deck-suggest/types';

function sug(id: string, name = id): Suggestion {
  return {
    suggestion_id: id,
    action: 'add',
    card: { name },
    quantity: 1,
    roles_matched: [],
    confidence: 'high',
    rationale: '',
    tags: [],
    replaces: [],
    priority_tier: 'normal',
  };
}

function run(decks: Array<{ deckId: string; ids: string[] }>): GenerationRun {
  return {
    runId: 'r1',
    rulesExecuted: [],
    deckResults: decks.map((d) => ({
      deck: { deck_id: d.deckId, deck_name: d.deckId },
      suggestions: d.ids.map((id) => sug(id)),
    })),
  };
}

describe('nextActionableSuggestion', () => {
  it('returns the first suggestion when afterId is omitted', () => {
    const next = nextActionableSuggestion(run([{ deckId: 'd1', ids: ['a', 'b'] }]), []);
    expect(next?.suggestion.suggestion_id).toBe('a');
    expect(next?.deckId).toBe('d1');
  });

  it('walks deck then suggestion order after afterId', () => {
    const generation = run([
      { deckId: 'd1', ids: ['a', 'b'] },
      { deckId: 'd2', ids: ['c'] },
    ]);
    expect(nextActionableSuggestion(generation, [], 'a')?.suggestion.suggestion_id).toBe('b');
    expect(nextActionableSuggestion(generation, [], 'b')?.deckId).toBe('d2');
    expect(nextActionableSuggestion(generation, [], 'b')?.suggestion.suggestion_id).toBe('c');
  });

  it('skips excluded ids after the cursor', () => {
    const generation = run([{ deckId: 'd1', ids: ['a', 'b', 'c'] }]);
    const next = nextActionableSuggestion(generation, ['b', 'a'], 'a');
    expect(next?.suggestion.suggestion_id).toBe('c');
  });

  it('returns null at the end of the queue', () => {
    const generation = run([{ deckId: 'd1', ids: ['a'] }]);
    expect(nextActionableSuggestion(generation, ['a'], 'a')).toBeNull();
    expect(nextActionableSuggestion(generation, [], 'a')).toBeNull();
  });

  it('returns null for empty or missing runs', () => {
    expect(nextActionableSuggestion(null, [])).toBeNull();
    expect(nextActionableSuggestion({ runId: 'x', rulesExecuted: [], deckResults: [] }, [])).toBeNull();
  });
});
