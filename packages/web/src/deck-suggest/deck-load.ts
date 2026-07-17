import { bridgeAvailable } from '../lib/hub-utils';
import type { DeckLoadTab, DeckRecord, DeckSelection, DeckSuggestSettings } from './types';
export type { DeckLoadTab } from './types';
export function normalizeDeckLoadTab(tab: string | undefined | null): DeckLoadTab {
  if (tab === 'paste') {
    return 'paste-urls';
  }
  return (tab as DeckLoadTab) || 'paste-import';
}

export function resolveDeckLoadTab(
  ui: { deckLoadTab?: string | null },
  settings: DeckSuggestSettings,
): DeckLoadTab {
  let tab: DeckLoadTab | null = null;
  if (ui && ui.deckLoadTab) {
    tab = normalizeDeckLoadTab(ui.deckLoadTab);
  } else if (settings.deckLoadTab) {
    tab = normalizeDeckLoadTab(settings.deckLoadTab);
  } else {
    tab = bridgeAvailable() ? 'folder' : 'paste-import';
  }
  if (tab === 'folder' && !bridgeAvailable()) {
    return 'paste-import';
  }
  return tab;
}

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
