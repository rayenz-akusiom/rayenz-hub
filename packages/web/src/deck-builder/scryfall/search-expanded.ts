const STORAGE_KEY = 'rayenz-scryfall-search-expanded';

export function loadScryfallSearchExpanded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveScryfallSearchExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, expanded ? '1' : '0');
  } catch {
    /* quota / private mode */
  }
}
