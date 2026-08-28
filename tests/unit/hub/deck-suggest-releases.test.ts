import { describe, expect, it } from 'vitest';
import {
  formatReleaseOptionLabel,
  formatSetCodesPreview,
  isUpcomingRelease,
  listReleaseOptions,
  parseReleaseId,
  partitionReleaseOptions,
  type PartitionedReleases,
} from '../../../packages/web/src/deck-suggest/releases.ts';
import type { ReleaseCatalogEntry } from '@rayenz-hub/shared';

function entry(
  partial: Partial<ReleaseCatalogEntry> & Pick<ReleaseCatalogEntry, 'id' | 'kind' | 'code' | 'name'>,
): ReleaseCatalogEntry {
  return {
    released_at: null,
    set_codes: [partial.code],
    ...partial,
  };
}

describe('isUpcomingRelease', () => {
  const now = new Date('2026-08-16T15:00:00.000Z');

  it('keeps unreleased sets in upcoming', () => {
    expect(isUpcomingRelease('2026-09-01', now)).toBe(true);
  });

  it('keeps sets within a week of release', () => {
    expect(isUpcomingRelease('2026-08-14', now)).toBe(true);
    expect(isUpcomingRelease('2026-08-09', now)).toBe(true);
  });

  it('merges sets older than a week into the main lists', () => {
    expect(isUpcomingRelease('2026-08-08', now)).toBe(false);
    expect(isUpcomingRelease('2023-06-23', now)).toBe(false);
  });

  it('treats missing dates as not upcoming', () => {
    expect(isUpcomingRelease(null, now)).toBe(false);
    expect(isUpcomingRelease('', now)).toBe(false);
  });
});

describe('partitionReleaseOptions', () => {
  const now = new Date('2026-08-16T15:00:00.000Z');
  const releases = [
    entry({
      id: 'group:hob',
      kind: 'group',
      code: 'HOB',
      name: 'The Hobbit',
      released_at: '2026-09-01',
    }),
    entry({
      id: 'group:ecl',
      kind: 'group',
      code: 'ECL',
      name: 'Lorwyn Eclipsed',
      released_at: '2026-08-12',
    }),
    entry({
      id: 'group:ltr',
      kind: 'group',
      code: 'LTR',
      name: 'The Lord of the Rings',
      released_at: '2023-06-23',
    }),
    entry({
      id: 'block:zen',
      kind: 'block',
      code: 'ZEN',
      name: 'Zendikar',
      released_at: '2009-10-02',
    }),
  ];

  it('puts future and recent sets in Upcoming, older into Groups/Blocks', () => {
    const parts: PartitionedReleases = partitionReleaseOptions(releases, now);
    expect(parts.upcoming.map((r) => r.code)).toEqual(['ECL', 'HOB']);
    expect(parts.groups.map((r) => r.code)).toEqual(['LTR']);
    expect(parts.blocks.map((r) => r.code)).toEqual(['ZEN']);
  });

  it('formats upcoming labels with release date', () => {
    expect(
      formatReleaseOptionLabel(releases[0], { includeReleaseDate: true }),
    ).toBe('The Hobbit (HOB) — 2026-09-01');
    expect(formatReleaseOptionLabel(releases[2])).toBe('The Lord of the Rings (LTR)');
  });
});

describe('parseReleaseId', () => {
  it('parses pinned release ids with hyphens', () => {
    expect(parseReleaseId('pinned:secret-lair-all')).toEqual({
      kind: 'pinned',
      code: 'SECRET-LAIR-ALL',
    });
    expect(parseReleaseId('group:ltr')).toEqual({ kind: 'group', code: 'LTR' });
  });
});

describe('listReleaseOptions', () => {
  it('prepends pinned Secret Lair shortcuts', () => {
    const options = listReleaseOptions();
    expect(options[0]?.kind).toBe('pinned');
    expect(options[0]?.id).toBe('pinned:secret-lair-all');
    expect(options.some((r) => r.id === 'group:ltr')).toBe(true);
  });
});

describe('partitionReleaseOptions', () => {
  it('does not place pinned entries in upcoming, groups, or blocks', () => {
    const now = new Date('2026-08-16T15:00:00.000Z');
    const pinned = listReleaseOptions().filter((r) => r.kind === 'pinned');
    const parts = partitionReleaseOptions(
      [...pinned, ...listReleaseOptions().filter((r) => r.kind !== 'pinned')],
      now,
    );
    const all = [...parts.upcoming, ...parts.groups, ...parts.blocks];
    expect(all.some((r) => r.kind === 'pinned')).toBe(false);
  });
});

describe('formatSetCodesPreview', () => {
  it('summarizes many set codes for pinned releases', () => {
    const entry: ReleaseCatalogEntry = {
      id: 'pinned:secret-lair-all',
      kind: 'pinned',
      code: 'SECRET-LAIR-ALL',
      name: 'Secret Lair (all)',
      released_at: null,
      set_codes: ['SLD', 'SLC', 'SLP', 'SLU', 'PSSC'],
    };
    const preview = formatSetCodesPreview(entry, entry.set_codes);
    expect(preview.summary).toMatch(/5 set\(s\)/);
    expect(preview.chips).toEqual([]);
  });
});
