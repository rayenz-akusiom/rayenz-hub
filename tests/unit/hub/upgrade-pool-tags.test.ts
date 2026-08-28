import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildOtagClause,
  collectProfileSearchTags,
  filterEvergreenKeywords,
  isEvergreenKeyword,
  isPackageThemeKey,
  searchTagsKeySuffix,
} from '../../../packages/shared/src/suggest/upgrade-pool-tags.ts';
import { resolveAdaptiveSearchTags } from '../../../packages/shared/src/suggest/upgrade-pool.ts';

describe('upgrade-pool-tags', () => {
  it('flags common evergreen keywords', () => {
    expect(isEvergreenKeyword('haste')).toBe(true);
    expect(isEvergreenKeyword('Flying')).toBe(true);
    expect(isEvergreenKeyword('removal')).toBe(false);
  });

  it('filters evergreens from keyword interests', () => {
    expect(filterEvergreenKeywords(['haste', 'flashback', 'trample'])).toEqual(['flashback']);
  });

  it('collects role tags before themes and skips evergreens', () => {
    const tags = collectProfileSearchTags({
      roles: [{ id: 'removal', tags: ['removal'] }, { id: 'speed', tags: ['haste'] }],
      themes: ['ramp', 'mana-production'],
      keyword_interests: ['flying'],
    });
    expect(tags).toEqual(['removal', 'ramp', 'mana-production']);
  });

  it('builds otag OR clauses', () => {
    expect(buildOtagClause(['removal'])).toBe('(otag:removal)');
    expect(buildOtagClause(['removal', 'ramp'])).toBe('(otag:removal OR otag:ramp)');
  });

  it('excludes rule and meta keys from package themes', () => {
    expect(isPackageThemeKey('rule:role_synergy')).toBe(false);
    expect(isPackageThemeKey('keyword')).toBe(false);
    expect(isPackageThemeKey('haste')).toBe(false);
    expect(isPackageThemeKey('removal')).toBe(true);
  });

  it('hashes search tags for pool cache keys', () => {
    expect(searchTagsKeySuffix(['ramp', 'removal'])).toBe(':tags-ramp+removal');
  });
});

describe('resolveAdaptiveSearchTags', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('broadens otag OR clause when probe count is below target', async () => {
    let probeCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        probeCalls += 1;
        const q = new URL(url).searchParams.get('q') || '';
        const tagCount = (q.match(/otag:/g) || []).length;
        let total = 500;
        if (tagCount === 1) total = 40;
        if (tagCount >= 2) total = 120;
        return {
          ok: true,
          json: async () => ({ data: [], total_cards: total }),
        };
      }),
    );

    const tags = await resolveAdaptiveSearchTags(
      ['removal', 'ramp'],
      'id:rg usd<=8.33',
      { order: 'usd', dir: 'desc' },
      100,
    );
    expect(tags).toEqual(['removal', 'ramp']);
    expect(probeCalls).toBeGreaterThanOrEqual(2);
  });
});
