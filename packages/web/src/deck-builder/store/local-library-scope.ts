export const LOCAL_LIBRARY_SCOPE_KEY = 'rayenz-deck-builder-local-scope';

export const SANDBOX_DECK_TTL_DAYS = 30;
export const SANDBOX_DECK_TTL_MS = SANDBOX_DECK_TTL_DAYS * 24 * 60 * 60 * 1000;

export type LocalLibraryScope = 'sandbox' | 'account';

type ScopeMap = Record<string, LocalLibraryScope>;

function readScopeMap(): ScopeMap {
  try {
    const raw = localStorage.getItem(LOCAL_LIBRARY_SCOPE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ScopeMap = {};
    for (const [deckId, scope] of Object.entries(parsed as Record<string, unknown>)) {
      if (scope === 'sandbox' || scope === 'account') out[deckId] = scope;
    }
    return out;
  } catch {
    return {};
  }
}

function writeScopeMap(map: ScopeMap): void {
  try {
    localStorage.setItem(LOCAL_LIBRARY_SCOPE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Explicit sidecar value, or `undefined` when the deck has never been tagged. */
export function peekLocalLibraryScope(deckId: string): LocalLibraryScope | undefined {
  return readScopeMap()[deckId];
}

/** Missing key → sandbox (existing local-only decks stay playground). */
export function getLocalLibraryScope(deckId: string): LocalLibraryScope {
  return peekLocalLibraryScope(deckId) ?? 'sandbox';
}

export function setLocalLibraryScope(deckId: string, scope: LocalLibraryScope): void {
  const map = readScopeMap();
  map[deckId] = scope;
  writeScopeMap(map);
}

export function clearLocalLibraryScope(deckId: string): void {
  const map = readScopeMap();
  if (!(deckId in map)) return;
  delete map[deckId];
  writeScopeMap(map);
}

/** Test helper */
export function __resetLocalLibraryScopeForTests(): void {
  try {
    localStorage.removeItem(LOCAL_LIBRARY_SCOPE_KEY);
  } catch {
    /* ignore */
  }
}
