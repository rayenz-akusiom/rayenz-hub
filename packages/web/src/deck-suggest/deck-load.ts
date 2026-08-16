import type { DeckRecord, DeckSelection } from './types';

export function applyDeckList(
  decks: DeckRecord[],
  deckSelection: DeckSelection,
): DeckSelection {
  const sorted = decks.slice().sort((a, b) => String(a.deck_name).localeCompare(String(b.deck_name)));
  return {
    ...deckSelection,
    decks: sorted,
    selectedIds: sorted.map((d) => d.deck_id),
  };
}

export function toggleDeckSelection(selectedIds: string[], deckId: string, checked: boolean): string[] {
  if (checked) {
    return selectedIds.indexOf(deckId) >= 0 ? selectedIds : selectedIds.concat(deckId);
  }
  return selectedIds.filter((id) => id !== deckId);
}

export function selectAllDecks(decks: DeckRecord[]): string[] {
  return decks.map((d) => d.deck_id);
}
