import { describe, expect, it } from 'vitest';
import type { DeckDocument } from '@rayenz-hub/shared';
import {
  createDeckEditHistory,
  DECK_EDIT_HISTORY_CAP,
} from '../../../packages/web/src/deck-builder/useDeckEditHistory';

function doc(overrides: Partial<DeckDocument> & { deckId: string; name: string }): DeckDocument {
  return {
    schemaVersion: 1,
    format: 'commander',
    ownership: 'owned',
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards: [],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
    ...overrides,
  };
}

describe('createDeckEditHistory', () => {
  it('records, undoes, and redoes document snapshots', () => {
    const history = createDeckEditHistory();
    const a = doc({ deckId: 'd1', name: 'A' });
    const b = doc({ deckId: 'd1', name: 'B', updatedAt: '2024-01-02T00:00:00.000Z' });
    const c = doc({ deckId: 'd1', name: 'C', updatedAt: '2024-01-03T00:00:00.000Z' });

    history.recordBefore(a);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    history.recordBefore(b);
    const undone = history.undo(c);
    expect(undone?.name).toBe('B');
    expect(history.canRedo).toBe(true);

    const redone = history.redo(undone!);
    expect(redone?.name).toBe('C');
    expect(history.canUndo).toBe(true);
  });

  it('clones snapshots so later mutation does not rewrite history', () => {
    const history = createDeckEditHistory();
    const a = doc({ deckId: 'd1', name: 'A' });
    history.recordBefore(a);
    a.name = 'mutated';
    const undone = history.undo(doc({ deckId: 'd1', name: 'B' }));
    expect(undone?.name).toBe('A');
  });

  it('clears stacks', () => {
    const history = createDeckEditHistory();
    history.recordBefore(doc({ deckId: 'd1', name: 'A' }));
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.undo(doc({ deckId: 'd1', name: 'B' }))).toBeNull();
  });

  it('new edits clear the redo stack', () => {
    const history = createDeckEditHistory();
    const a = doc({ deckId: 'd1', name: 'A' });
    const b = doc({ deckId: 'd1', name: 'B' });
    const c = doc({ deckId: 'd1', name: 'C' });
    history.recordBefore(a);
    history.undo(b);
    expect(history.canRedo).toBe(true);
    history.recordBefore(c);
    expect(history.canRedo).toBe(false);
    expect(history.redo(c)).toBeNull();
  });

  it('caps past stack length', () => {
    const cap = 3;
    const history = createDeckEditHistory(cap);
    for (let i = 0; i < cap + 2; i++) {
      history.recordBefore(doc({ deckId: 'd1', name: `n${i}` }));
    }
    const names: string[] = [];
    let current = doc({ deckId: 'd1', name: 'head' });
    while (history.canUndo) {
      const prev = history.undo(current);
      if (!prev) break;
      names.push(prev.name);
      current = prev;
    }
    expect(names).toEqual(['n4', 'n3', 'n2']);
    expect(names.length).toBe(cap);
    expect(DECK_EDIT_HISTORY_CAP).toBeGreaterThanOrEqual(cap);
  });

  it('returns null when stacks are empty', () => {
    const history = createDeckEditHistory();
    const cur = doc({ deckId: 'd1', name: 'A' });
    expect(history.undo(cur)).toBeNull();
    expect(history.redo(cur)).toBeNull();
  });
});
