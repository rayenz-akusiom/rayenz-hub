import { getReleaseCatalog } from './release-catalog-data.js';
import type { ReleaseCatalogEntry, ReleaseKind, SecretLairSetRow } from './release-catalog.js';

export const SECRET_LAIR_WINDOW_DAYS = 30;

export const PINNED_RELEASE_DEFS = [
  {
    id: 'pinned:secret-lair-all',
    kind: 'pinned' as const,
    code: 'SECRET-LAIR-ALL',
    name: 'Secret Lair (all)',
  },
  {
    id: 'pinned:secret-lair-30d',
    kind: 'pinned' as const,
    code: 'SECRET-LAIR-30D',
    name: 'Secret Lair (30 days)',
  },
] as const;

export type PinnedReleaseCode = (typeof PINNED_RELEASE_DEFS)[number]['code'];

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Parse Scryfall `YYYY-MM-DD` as UTC midnight; invalid/missing → null. */
export function parseReleaseDay(releasedAt: string | null | undefined): number | null {
  const raw = String(releasedAt || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Format UTC midnight as Scryfall `YYYY-MM-DD`. */
export function formatReleaseDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * True when `releasedAt` falls within ±`windowDays` of `now` (UTC days).
 * Undated releases return false.
 */
export function isWithinReleaseWindow(
  releasedAt: string | null | undefined,
  now: Date = new Date(),
  windowDays = SECRET_LAIR_WINDOW_DAYS,
): boolean {
  const releaseDay = parseReleaseDay(releasedAt);
  if (releaseDay == null) return false;
  const today = startOfUtcDay(now);
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return releaseDay >= today - windowMs && releaseDay <= today + windowMs;
}

export function secretLairSetsFromCatalog(): SecretLairSetRow[] {
  const catalog = getReleaseCatalog();
  return catalog.secretLairSets?.length ? catalog.secretLairSets : [];
}

export function resolvePinnedSetCodes(
  code: string,
  now: Date = new Date(),
): string[] {
  const upper = String(code || '').trim().toUpperCase();
  const sets = secretLairSetsFromCatalog();
  if (upper === 'SECRET-LAIR-ALL') {
    return sets.map((s) => s.code);
  }
  if (upper === 'SECRET-LAIR-30D') {
    return sets
      .filter((s) => isWithinReleaseWindow(s.released_at, now))
      .map((s) => s.code);
  }
  return [];
}

/** Stable set-pool cache key for a pinned release. */
export function pinnedReleasePoolKey(code: string): string {
  const upper = String(code || '').trim().toUpperCase();
  const def = PINNED_RELEASE_DEFS.find((d) => d.code === upper);
  return def?.id || `pinned:${upper.toLowerCase()}`;
}

export function findPinnedRelease(id: string | null | undefined): ReleaseCatalogEntry | null {
  const raw = String(id || '').trim();
  if (!raw) return null;
  const def = PINNED_RELEASE_DEFS.find((d) => d.id === raw);
  if (!def) return null;
  return pinnedDefToEntry(def, new Date());
}

export function findPinnedReleaseByKindCode(
  kind: ReleaseKind,
  code: string,
  now: Date = new Date(),
): ReleaseCatalogEntry | null {
  if (kind !== 'pinned') return null;
  const upper = String(code || '').trim().toUpperCase();
  const def = PINNED_RELEASE_DEFS.find((d) => d.code === upper);
  if (!def) return null;
  return pinnedDefToEntry(def, now);
}

function pinnedDefToEntry(
  def: (typeof PINNED_RELEASE_DEFS)[number],
  now: Date,
): ReleaseCatalogEntry {
  const set_codes = resolvePinnedSetCodes(def.code, now);
  const dated = set_codes
    .map((code) => secretLairSetsFromCatalog().find((s) => s.code === code))
    .filter(Boolean) as SecretLairSetRow[];
  const released_at =
    dated.reduce<string | null>((latest, row) => {
      const d = row.released_at;
      if (!d) return latest;
      if (!latest || d > latest) return d;
      return latest;
    }, null);
  return {
    id: def.id,
    kind: 'pinned',
    code: def.code,
    name: def.name,
    released_at,
    set_codes,
  };
}

export function getPinnedReleaseEntries(now: Date = new Date()): ReleaseCatalogEntry[] {
  return PINNED_RELEASE_DEFS.map((def) => pinnedDefToEntry(def, now));
}
