import { useRef } from 'react';
import type { DeckDocument } from '@rayenz-hub/shared';

export const DECK_EDIT_HISTORY_CAP = 50;

export type DeckEditHistory = {
  clear: () => void;
  /** Push a clone of `current` onto the past stack and clear redo. */
  recordBefore: (current: DeckDocument) => void;
  /** Pop past → push current to future; returns previous doc or null. */
  undo: (current: DeckDocument) => DeckDocument | null;
  /** Pop future → push current to past; returns next doc or null. */
  redo: (current: DeckDocument) => DeckDocument | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
};

/** Session undo/redo stacks for deck document edits (not React state). */
export function createDeckEditHistory(
  maxEntries: number = DECK_EDIT_HISTORY_CAP,
): DeckEditHistory {
  let past: DeckDocument[] = [];
  let future: DeckDocument[] = [];

  return {
    clear() {
      past = [];
      future = [];
    },
    recordBefore(current) {
      past.push(structuredClone(current));
      if (past.length > maxEntries) past.shift();
      future = [];
    },
    undo(current) {
      if (!past.length) return null;
      const prev = past.pop()!;
      future.push(structuredClone(current));
      return prev;
    },
    redo(current) {
      if (!future.length) return null;
      const next = future.pop()!;
      past.push(structuredClone(current));
      if (past.length > maxEntries) past.shift();
      return next;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
  };
}

/** Stable per-mount history instance for BrowseShell. */
export function useDeckEditHistory(
  maxEntries: number = DECK_EDIT_HISTORY_CAP,
): DeckEditHistory {
  const ref = useRef<DeckEditHistory | null>(null);
  if (!ref.current) ref.current = createDeckEditHistory(maxEntries);
  return ref.current;
}
