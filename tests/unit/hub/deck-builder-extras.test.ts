import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearExtrasCache,
  collectExtrasRelatedIds,
  collectionBinderSourceCards,
  extrasCardView,
  isExtrasRelatedPart,
  mainDeckSourceCards,
  resolveExtrasDisplayCards,
  type DeckDocument,
} from '../../../packages/shared/src/index.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

afterEach(() => {
  clearExtrasCache();
});

describe('isExtrasRelatedPart', () => {
  const self = 'parent-id';

  it('keeps component:token', () => {
    expect(
      isExtrasRelatedPart(
        { id: 'tok-1', component: 'token', name: 'Soldier', type_line: 'Token Creature — Soldier' },
        self,
      ),
    ).toBe(true);
  });

  it('keeps emblems and dungeons by type line even as combo_piece', () => {
    expect(
      isExtrasRelatedPart(
        { id: 'emb-1', component: 'combo_piece', name: 'Jace Emblem', type_line: 'Emblem — Jace' },
        self,
      ),
    ).toBe(true);
    expect(
      isExtrasRelatedPart(
        { id: 'dun-1', component: 'combo_piece', name: 'Dungeon', type_line: 'Dungeon' },
        self,
      ),
    ).toBe(true);
  });

  it('drops self, meld parts/results, and named combo pieces', () => {
    expect(
      isExtrasRelatedPart(
        { id: self, component: 'token', name: 'Self', type_line: 'Token' },
        self,
      ),
    ).toBe(false);
    expect(
      isExtrasRelatedPart(
        { id: 'meld-a', component: 'meld_part', name: 'Meld A', type_line: 'Creature' },
        self,
      ),
    ).toBe(false);
    expect(
      isExtrasRelatedPart(
        { id: 'meld-r', component: 'meld_result', name: 'Meld Result', type_line: 'Creature' },
        self,
      ),
    ).toBe(false);
    expect(
      isExtrasRelatedPart(
        {
          id: 'combo-1',
          component: 'combo_piece',
          name: 'Time Walk',
          type_line: 'Sorcery',
        },
        self,
      ),
    ).toBe(false);
  });
});

describe('collectExtrasRelatedIds', () => {
  it('dedupes related ids across parents', () => {
    const map = new Map([
      [
        'p1',
        [
          { id: 'tok-shared', component: 'token', name: 'Soldier', type_line: 'Token Creature' },
          { id: 'emb-1', component: 'combo_piece', name: 'Emblem', type_line: 'Emblem — X' },
        ],
      ],
      [
        'p2',
        [{ id: 'tok-shared', component: 'token', name: 'Soldier', type_line: 'Token Creature' }],
      ],
    ]);
    expect(collectExtrasRelatedIds(map).sort()).toEqual(['emb-1', 'tok-shared']);
  });
});

describe('mainDeckSourceCards / collectionBinderSourceCards', () => {
  it('includes main deck and header, excludes maybeboard', () => {
    const deck = {
      ...(commander as DeckDocument),
      categories: [
        ...(commander as DeckDocument).categories,
        { name: 'Maybeboard', includedInDeck: false, includedInPrice: false, target: null },
        { name: 'Commander', includedInDeck: true, includedInPrice: true, target: null },
      ],
      cards: [
        ...(commander as DeckDocument).cards,
        {
          instanceId: 'cmd-1',
          name: 'Atraxa',
          quantity: 1,
          ownedQuantity: 0,
          inDeckQuantity: 0,
          primaryCategory: 'Commander',
          categories: ['Commander'],
          stack: null,
          setCode: 'c16',
          collectorNumber: '1',
          scryfallId: 'cmd-sf',
          archidektCardId: null,
          foil: false,
          proxy: false,
          collectionSource: 'manual' as const,
          collectionIgnored: false,
        },
        {
          instanceId: 'mb-1',
          name: 'Maybe Card',
          quantity: 1,
          ownedQuantity: 0,
          inDeckQuantity: 0,
          primaryCategory: 'Maybeboard',
          categories: ['Maybeboard'],
          stack: null,
          setCode: 'lea',
          collectorNumber: '1',
          scryfallId: 'mb-sf',
          archidektCardId: null,
          foil: false,
          proxy: false,
          collectionSource: 'manual' as const,
          collectionIgnored: false,
        },
      ],
    };
    const ids = mainDeckSourceCards(deck).map((c) => c.instanceId);
    expect(ids).toContain('c1');
    expect(ids).toContain('cmd-1');
    expect(ids).not.toContain('mb-1');
  });

  it('excludes ignored collection cards from binder sources', () => {
    const deck: Pick<DeckDocument, 'cards' | 'oracle'> = {
      oracle: {},
      cards: [
        {
          instanceId: 'a',
          name: 'Jace',
          quantity: 1,
          ownedQuantity: 1,
          inDeckQuantity: 0,
          primaryCategory: 'Collection',
          categories: ['Collection'],
          stack: null,
          setCode: 'm10',
          collectorNumber: '1',
          scryfallId: 'a',
          archidektCardId: null,
          foil: false,
          proxy: false,
          collectionSource: 'search',
          collectionIgnored: false,
        },
        {
          instanceId: 'b',
          name: 'Chandra',
          quantity: 1,
          ownedQuantity: 0,
          inDeckQuantity: 0,
          primaryCategory: 'Collection',
          categories: ['Collection'],
          stack: null,
          setCode: 'm10',
          collectorNumber: '2',
          scryfallId: 'b',
          archidektCardId: null,
          foil: false,
          proxy: false,
          collectionSource: 'search',
          collectionIgnored: true,
        },
      ],
    };
    expect(collectionBinderSourceCards(deck).map((c) => c.instanceId)).toEqual(['a']);
  });
});

describe('extrasCardView', () => {
  it('builds a synthetic extras CardView', () => {
    const view = extrasCardView({
      scryfallId: 'tok-1',
      name: 'Soldier',
      typeLine: 'Token Creature — Soldier',
      layout: 'token',
      setCode: 'tmh3',
      collectorNumber: '1',
    });
    expect(view.instanceId).toBe('__extra__tok-1');
    expect(view.primaryCategory).toBe('Extras');
    expect(view.imageUrl).toContain('tok-1');
  });
});

describe('resolveExtrasDisplayCards', () => {
  it('fetches parents and related tokens via collection', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as {
        identifiers: { id: string }[];
      };
      const ids = body.identifiers.map((x) => x.id.toLowerCase());
      const data = [];
      if (ids.includes('parent-1')) {
        data.push({
          id: 'parent-1',
          name: 'Parent',
          set: 'mh3',
          collector_number: '1',
          type_line: 'Creature',
          layout: 'normal',
          all_parts: [
            {
              id: 'parent-1',
              component: 'combo_piece',
              name: 'Parent',
              type_line: 'Creature',
            },
            {
              id: 'tok-1',
              component: 'token',
              name: 'Soldier',
              type_line: 'Token Creature — Soldier',
            },
            {
              id: 'combo-x',
              component: 'combo_piece',
              name: 'Named Spell',
              type_line: 'Instant',
            },
          ],
        });
      }
      if (ids.includes('tok-1')) {
        data.push({
          id: 'tok-1',
          name: 'Soldier',
          set: 'tmh3',
          collector_number: '4',
          type_line: 'Token Creature — Soldier',
          layout: 'token',
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data, not_found: [] }),
      };
    });

    const result = await resolveExtrasDisplayCards(['parent-1'], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.scryfallId).toBe('tok-1');
    expect(result[0]?.setCode).toBe('tmh3');
    expect(fetchImpl).toHaveBeenCalled();
  });
});
