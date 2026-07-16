import type { DeckDocument, FormalSwapEntry } from '@rayenz-hub/shared';

/** Hook-shaped helper for swap queue updates (used by panel / future extraction). */
export function updateSwapEntries(deck: DeckDocument, entries: FormalSwapEntry[]): DeckDocument {
  return {
    ...deck,
    formalSwapEntries: entries.map((e, i) => ({ ...e, sortIndex: i })),
    updatedAt: new Date().toISOString(),
  };
}
