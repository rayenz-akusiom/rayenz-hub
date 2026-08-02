const STORAGE_KEY = 'rayenz-scryfall-recent-searches';
const MAX_RECENT = 10;

export function loadRecentScryfallSearches(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((q) => String(q || '').trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function rememberScryfallSearch(query: string): string[] {
  const q = query.trim();
  if (!q) return loadRecentScryfallSearches();
  const prev = loadRecentScryfallSearches().filter((x) => x.toLowerCase() !== q.toLowerCase());
  const next = [q, ...prev].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}
