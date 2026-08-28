import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildUpgradePool,
  buildUpgradeThemePools,
  computePerCardCap,
  computeUpgradePoolKey,
  readUpgradePoolCap,
} from '../../../packages/shared/src/suggest/upgrade-pool.ts';
import type { DeckRecord } from '../../../packages/shared/src/suggest/types.ts';

vi.mock('../../../packages/shared/src/scryfall/index.ts', () => ({
  SCRYFALL_SUGGEST_POOL_FILTERS: 'game:paper',
  maybeAttachScryfallTags: async (cards: unknown[]) => cards,
}));

const deck: DeckRecord = {
  deck_id: 'cmd-fixture',
  deck_name: 'Test',
  deck_snapshot: {
    cards: [{ name: 'Sol Ring', color_identity: ['U'], categories: ['Artifact'] }],
  },
};

function scryfallOk(body: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({ total_cards: 150, ...body }),
  };
}

describe('upgrade-pool helpers', () => {
  it('computes per-card USD cap from budget', () => {
    expect(computePerCardCap(25)).toBeCloseTo(8.33, 2);
    expect(computePerCardCap(3)).toBe(1);
    expect(computePerCardCap(100)).toBe(15);
  });

  it('builds pool keys with focus and search tag suffixes', () => {
    expect(computeUpgradePoolKey('d1', 25)).toBe('upgrade:d1:25');
    expect(computeUpgradePoolKey('d1', 25, ['mana-production'])).toBe(
      'upgrade:d1:25:focus-mana-production',
    );
    expect(computeUpgradePoolKey('d1', 25, [], ['removal', 'ramp'])).toBe(
      'upgrade:d1:25:tags-ramp+removal',
    );
    expect(computeUpgradePoolKey('d1', 25, [], [], 'removal')).toBe('upgrade:d1:25:theme-removal');
  });

  it('reads HUB_UPGRADE_POOL_CAP from env', () => {
    const prev = process.env.HUB_UPGRADE_POOL_CAP;
    process.env.HUB_UPGRADE_POOL_CAP = '42';
    expect(readUpgradePoolCap()).toBe(42);
    if (prev == null) delete process.env.HUB_UPGRADE_POOL_CAP;
    else process.env.HUB_UPGRADE_POOL_CAP = prev;
  });
});

describe('buildUpgradePool', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        scryfallOk({
          data: [
            {
              name: 'Mana Rock',
              set: 'CMR',
              collector_number: '1',
              type_line: 'Artifact',
              oracle_text: 'Add mana',
              keywords: [],
              color_identity: ['U'],
              cmc: 2,
              oracle_tags: ['mana-production'],
              prices: { usd: '2.00' },
            },
            {
              name: 'Removal',
              set: 'CMR',
              collector_number: '2',
              type_line: 'Instant',
              oracle_text: 'destroy target creature',
              keywords: [],
              color_identity: ['U'],
              cmc: 2,
              oracle_tags: ['removal'],
              prices: { usd: '1.50' },
            },
          ],
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('narrows pool by focus tags', async () => {
    const result = await buildUpgradePool(
      deck,
      { themes: ['mana-production', 'removal'] },
      25,
      {
        focusTags: ['mana-production'],
        cap: 250,
      },
    );
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.name).toBe('Mana Rock');
    expect(result.codesKey).toContain('focus-mana-production');
    expect(result.codesKey).toContain('tags-');
  });

  it('requests otag-scoped usd-ordered Scryfall searches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(scryfallOk({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await buildUpgradePool(deck, { themes: ['removal'] }, 25, { cap: 250 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0] || ''));
    const q = url.searchParams.get('q') || '';
    expect(q).toContain('otag:removal');
    expect(url.searchParams.get('order')).toBe('usd');
    expect(url.searchParams.get('dir')).toBe('desc');
  });

  it('caps card count preferring higher-priced cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        scryfallOk({
          data: Array.from({ length: 10 }, (_, i) => ({
            name: `Card ${i}`,
            set: 'CMR',
            collector_number: String(i),
            type_line: 'Creature',
            oracle_text: 'token',
            keywords: [],
            color_identity: ['U'],
            cmc: 1,
            oracle_tags: ['tokens'],
            prices: { usd: String((i + 1) / 10) },
          })),
        }),
      ),
    );
    const result = await buildUpgradePool(deck, { themes: ['tokens'] }, 25, { cap: 3 });
    expect(result.cardCount).toBe(3);
    expect(result.cards).toHaveLength(3);
    expect(result.cards[0]?.name).toBe('Card 9');
  });

  it('sends User-Agent on Scryfall search', async () => {
    const fetchMock = vi.fn().mockResolvedValue(scryfallOk({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await buildUpgradePool(deck, {}, 25, { cap: 250 });
    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>)?.['User-Agent']).toBe('rayenz-hub/1.0');
  });

  it('treats Scryfall 404 as empty search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );
    const result = await buildUpgradePool(deck, {}, 25);
    expect(result.cards).toHaveLength(0);
  });

  it('paginates when fetching large otag pools', async () => {
    const baseCard = {
      set: 'CMR',
      collector_number: '1',
      type_line: 'Creature',
      oracle_text: 'token',
      keywords: [],
      color_identity: ['U'],
      cmc: 1,
      oracle_tags: ['tokens'],
      prices: { usd: '1.00' },
    };
    let page = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      page += 1;
      return scryfallOk({
        data: Array.from({ length: 5 }, (_, i) => ({
          ...baseCard,
          name: `Card ${page}-${i}`,
          collector_number: String(i),
        })),
        next_page: page < 5 ? `https://api.scryfall.com/cards/search?page=${page + 1}` : null,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await buildUpgradePool(deck, { themes: ['tokens'] }, 25, { cap: 3 });
    expect(result.cards).toHaveLength(3);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('builds separate pools per profile theme with cross-package dedup', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const q = new URL(String(url)).searchParams.get('q') || '';
      if (q.includes('otag:removal')) {
        return scryfallOk({
          data: [
            {
              name: 'Shared Card',
              set: 'CMR',
              collector_number: '1',
              type_line: 'Instant',
              oracle_text: 'destroy',
              keywords: [],
              color_identity: ['U'],
              cmc: 2,
              oracle_id: 'shared-oracle',
              oracle_tags: ['removal'],
              prices: { usd: '2.00' },
            },
            {
              name: 'Removal Only',
              set: 'CMR',
              collector_number: '2',
              type_line: 'Instant',
              oracle_text: 'destroy',
              keywords: [],
              color_identity: ['U'],
              cmc: 2,
              oracle_id: 'removal-only',
              oracle_tags: ['removal'],
              prices: { usd: '1.50' },
            },
          ],
        });
      }
      return scryfallOk({
        data: [
          {
            name: 'Shared Card',
            set: 'CMR',
            collector_number: '1',
            type_line: 'Artifact',
            oracle_text: 'Add mana',
            keywords: [],
            color_identity: ['U'],
            cmc: 2,
            oracle_id: 'shared-oracle',
            oracle_tags: ['ramp'],
            prices: { usd: '2.00' },
          },
          {
            name: 'Ramp Only',
            set: 'CMR',
            collector_number: '3',
            type_line: 'Artifact',
            oracle_text: 'Add mana',
            keywords: [],
            color_identity: ['U'],
            cmc: 2,
            oracle_id: 'ramp-only',
            oracle_tags: ['ramp'],
            prices: { usd: '1.00' },
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await buildUpgradeThemePools(
      deck,
      {
        roles: [
          { id: 'removal', tags: ['removal'] },
          { id: 'ramp', tags: ['ramp'] },
        ],
      },
      25,
      { cap: 450 },
    );

    expect(result.themes).toEqual(['removal', 'ramp']);
    expect(result.pools.get('removal')?.cards).toHaveLength(2);
    expect(result.pools.get('ramp')?.cards).toHaveLength(1);
    expect(result.pools.get('ramp')?.cards[0]?.name).toBe('Ramp Only');
    expect(result.totalCardCount).toBe(3);
    const searchUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(searchUrls.some((u) => u.includes('otag%3Aremoval') || u.includes('otag:removal'))).toBe(
      true,
    );
    expect(searchUrls.some((u) => u.includes('otag%3Aramp') || u.includes('otag:ramp'))).toBe(true);
  });
});
