import type { ReleaseCatalogEntry, ReleaseKind } from '@rayenz-hub/shared';
import { getReleaseCatalog } from '@rayenz-hub/shared';

/** Keep a release in the top “Upcoming” section until it is more than this many days past release. */
export const UPCOMING_RELEASE_GRACE_DAYS = 7;

export function parseReleaseId(
  id: string | null | undefined,
): { kind: ReleaseKind; code: string } | null {
  const raw = String(id || '').trim();
  if (!raw) return null;
  const match = /^(group|block):([A-Za-z0-9]+)$/i.exec(raw);
  if (!match) return null;
  return { kind: match[1].toLowerCase() as ReleaseKind, code: match[2].toUpperCase() };
}

export function findReleaseEntry(releaseId: string | null | undefined): ReleaseCatalogEntry | null {
  const parsed = parseReleaseId(releaseId);
  if (!parsed) return null;
  const catalog = getReleaseCatalog();
  return (
    catalog.releases.find(
      (r) => r.kind === parsed.kind && r.code.toUpperCase() === parsed.code,
    ) || null
  );
}

export function listReleaseOptions(): ReleaseCatalogEntry[] {
  return getReleaseCatalog().releases;
}

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

/**
 * True while the set is unreleased or within `graceDays` after its release date.
 * Older releases (and undated ones) belong in Groups/Blocks.
 */
export function isUpcomingRelease(
  releasedAt: string | null | undefined,
  now: Date = new Date(),
  graceDays = UPCOMING_RELEASE_GRACE_DAYS,
): boolean {
  const releaseDay = parseReleaseDay(releasedAt);
  if (releaseDay == null) return false;
  const today = startOfUtcDay(now);
  const mergeAfter = releaseDay + graceDays * 24 * 60 * 60 * 1000;
  return today <= mergeAfter;
}

export type PartitionedReleases = {
  upcoming: ReleaseCatalogEntry[];
  groups: ReleaseCatalogEntry[];
  blocks: ReleaseCatalogEntry[];
};

export function partitionReleaseOptions(
  releases: ReleaseCatalogEntry[] = listReleaseOptions(),
  now: Date = new Date(),
): PartitionedReleases {
  const upcoming: ReleaseCatalogEntry[] = [];
  const groups: ReleaseCatalogEntry[] = [];
  const blocks: ReleaseCatalogEntry[] = [];

  for (const entry of releases) {
    if (isUpcomingRelease(entry.released_at, now)) {
      upcoming.push(entry);
      continue;
    }
    if (entry.kind === 'block') blocks.push(entry);
    else groups.push(entry);
  }

  upcoming.sort((a, b) => {
    const da = a.released_at || '';
    const db = b.released_at || '';
    return da.localeCompare(db) || a.name.localeCompare(b.name);
  });

  return { upcoming, groups, blocks };
}

export function formatReleaseOptionLabel(
  entry: ReleaseCatalogEntry,
  opts?: { includeReleaseDate?: boolean },
): string {
  const base = `${entry.name} (${entry.code})`;
  if (opts?.includeReleaseDate && entry.released_at) {
    return `${base} — ${entry.released_at}`;
  }
  return base;
}
