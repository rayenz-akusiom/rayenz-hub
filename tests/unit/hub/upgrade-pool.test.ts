import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildUpgradePool,
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

describe('upgrade-pool helpers', () => {
  it('computes per-card USD cap from budget', () => {
    expect(computePerCardCap(25)).toBeCloseTo(8.33, 2);
    expect(computePerCardCap(3)).toBe(1);
    expect(computePerCardCap(100)).toBe(15);
  });

  it('builds pool keys with optional focus suffix', () => {
    expect(computeUpgradePoolKey('d1', 25)).toBe('upgrade:d1:25');
    expect(computeUpgradePoolKey('d1', 25, ['mana-production'])).toBe(
      'upgrade:d1:25:focus-mana-production',
    );
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
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
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
      }),
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
  });

  it('caps card count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
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
            prices: { usd: '1.00' },
          })),
        }),
      }),
    );
    const result = await buildUpgradePool(deck, { themes: ['tokens'] }, 25, { cap: 3 });
    expect(result.cardCount).toBe(3);
    expect(result.cards).toHaveLength(3);
  });
});
