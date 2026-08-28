import { describe, expect, it } from 'vitest';
import {
  buildSecretLairSets,
  getPinnedReleaseEntries,
  isWithinReleaseWindow,
  parseReleaseDay,
  resolvePinnedSetCodes,
  SECRET_LAIR_WINDOW_DAYS,
} from '../../../packages/shared/src/scryfall/index.ts';

describe('isWithinReleaseWindow', () => {
  const now = new Date('2026-08-27T12:00:00.000Z');

  it('includes releases within ±30 days', () => {
    expect(isWithinReleaseWindow('2026-08-20', now)).toBe(true);
    expect(isWithinReleaseWindow('2026-09-20', now)).toBe(true);
    expect(isWithinReleaseWindow('2026-07-28', now)).toBe(true);
    expect(isWithinReleaseWindow('2026-09-26', now)).toBe(true);
  });

  it('excludes releases outside the window', () => {
    expect(isWithinReleaseWindow('2026-07-27', now)).toBe(false);
    expect(isWithinReleaseWindow('2026-09-27', now)).toBe(false);
    expect(isWithinReleaseWindow('2023-06-23', now)).toBe(false);
  });

  it('excludes undated releases', () => {
    expect(isWithinReleaseWindow(null, now)).toBe(false);
    expect(isWithinReleaseWindow('', now)).toBe(false);
  });
});

describe('resolvePinnedSetCodes', () => {
  const now = new Date('2026-02-25T12:00:00.000Z');

  it('returns all Secret Lair set codes for SECRET-LAIR-ALL', () => {
    const codes = resolvePinnedSetCodes('SECRET-LAIR-ALL', now);
    expect(codes).toContain('SLD');
    expect(codes.length).toBeGreaterThan(1);
  });

  it('filters to window for SECRET-LAIR-30D', () => {
    const all = resolvePinnedSetCodes('SECRET-LAIR-ALL', now);
    const recent = resolvePinnedSetCodes('SECRET-LAIR-30D', now);
    expect(recent.length).toBeLessThanOrEqual(all.length);
    for (const code of recent) {
      expect(all).toContain(code);
    }
  });

  it('returns empty for unknown pinned codes', () => {
    expect(resolvePinnedSetCodes('UNKNOWN', now)).toEqual([]);
  });
});

describe('getPinnedReleaseEntries', () => {
  it('includes all and 30-day Secret Lair shortcuts', () => {
    const entries = getPinnedReleaseEntries(new Date('2026-08-27T12:00:00.000Z'));
    expect(entries.map((e) => e.id)).toEqual([
      'pinned:secret-lair-all',
      'pinned:secret-lair-30d',
    ]);
    expect(entries[0]?.kind).toBe('pinned');
    expect(entries[0]?.set_codes.length).toBeGreaterThan(0);
  });
});

describe('buildSecretLairSets', () => {
  it('collects non-digital sets whose name starts with Secret Lair', () => {
    const sets = buildSecretLairSets([
      {
        code: 'sld',
        name: 'Secret Lair Drop',
        set_type: 'promo',
        released_at: '2019-12-02',
        digital: false,
      },
      {
        code: 'slx',
        name: 'Universes Within',
        set_type: 'commander',
        released_at: '2022-03-03',
        digital: false,
      },
      {
        code: 'dig',
        name: 'Secret Lair Digital',
        set_type: 'promo',
        released_at: '2024-01-01',
        digital: true,
      },
    ]);
    expect(sets).toEqual([
      {
        code: 'SLD',
        name: 'Secret Lair Drop',
        released_at: '2019-12-02',
      },
    ]);
  });
});

describe('parseReleaseDay', () => {
  it('parses Scryfall dates as UTC midnight', () => {
    expect(parseReleaseDay('2026-08-27')).toBe(Date.UTC(2026, 7, 27));
  });
});

describe('SECRET_LAIR_WINDOW_DAYS', () => {
  it('is 30', () => {
    expect(SECRET_LAIR_WINDOW_DAYS).toBe(30);
  });
});
