import type { DeckSummary } from '@rayenz-hub/shared';

export const LIBRARY_SORT_KEY = 'rayenz-deck-builder-library-sort';
export type LibrarySort = 'recent' | 'name' | 'cover';

export function readLibrarySort(): LibrarySort {
  try {
    const raw = localStorage.getItem(LIBRARY_SORT_KEY);
    if (raw === 'name' || raw === 'recent' || raw === 'cover') return raw;
  } catch {
    /* ignore */
  }
  return 'recent';
}

function coverSortKey(deck: DeckSummary): string {
  return (deck.coverCardName || deck.name || '').trim();
}

export function sortLibraryDecks(decks: DeckSummary[], sort: LibrarySort): DeckSummary[] {
  const list = [...decks];
  if (sort === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name) || b.updatedAt.localeCompare(a.updatedAt));
  } else if (sort === 'cover') {
    list.sort(
      (a, b) =>
        coverSortKey(a).localeCompare(coverSortKey(b)) ||
        a.name.localeCompare(b.name) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  } else {
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }
  return list;
}

export function persistLibrarySort(sort: LibrarySort): void {
  try {
    localStorage.setItem(LIBRARY_SORT_KEY, sort);
  } catch {
    /* ignore */
  }
}
