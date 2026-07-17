import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCardToDeck,
  applyPrintingToCard,
  buildPrintingsSearchUrl,
  buildSearchUrl,
  changeCardPrinting,
  clearScryfallPrintCache,
  collectionIdentifierForCard,
  defaultAddCategory,
  fetchCardsCollection,
  fetchPrintings,
  getOracle,
  mapScryfallCardToPrinting,
  oracleKey,
  removeCardFromDeck,
  searchCards,
} from '../../../packages/shared/src/index.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

const sampleCard = {
  id: 'sf-sol',
  name: 'Sol Ring',
  set: 'cmm',
  collector_number: '1',
  type_line: 'Artifact',
  color_identity: [],
  finishes: ['nonfoil', 'foil'],
};

beforeEach(() => {
  clearScryfallPrintCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scryfall URL builders', () => {
  it('builds search urls with query and page', () => {
    expect(buildSearchUrl('t:creature id:w', 1)).toContain('q=t%3Acreature+id%3Aw');
    expect(buildSearchUrl('sol ring', 2)).toContain('page=2');
    expect(buildSearchUrl('sol ring', 1)).not.toContain('page=');
  });

  it('builds exact-name printings search', () => {
    const url = buildPrintingsSearchUrl('Sol Ring');
    expect(url).toContain('unique=prints');
    expect(url).toMatch(/q=%21%22Sol[+%20]Ring%22/);
  });
});

describe('mapScryfallCardToPrinting', () => {
  it('maps scryfall fields onto printing fields', () => {
    const printing = mapScryfallCardToPrinting(sampleCard, { foil: true });
    expect(printing).toEqual({
      name: 'Sol Ring',
      scryfallId: 'sf-sol',
      setCode: 'cmm',
      collectorNumber: '1',
      typeLine: 'Artifact',
      colourIdentity: [],
      layout: null,
      foil: true,
      printedName: null,
      flavorName: null,
      manaValue: null,
    });
  });

  it('maps printed_name, flavor_name, and cmc', () => {
    const printing = mapScryfallCardToPrinting({
      id: 'sf-arvinox',
      name: 'Arvinox, the Mind Flail',
      set: 'sld',
      collector_number: '340',
      type_line: 'Legendary Enchantment Creature — Horror',
      color_identity: ['B'],
      finishes: ['nonfoil', 'foil'],
      printed_name: 'Mind Flayer, the Shadow',
      cmc: 7,
    });
    expect(printing.name).toBe('Arvinox, the Mind Flail');
    expect(printing.printedName).toBe('Mind Flayer, the Shadow');
    expect(printing.flavorName).toBeNull();
    expect(printing.manaValue).toBe(7);
  });

  it('maps layout onto printing fields', () => {
    const printing = mapScryfallCardToPrinting({
      ...sampleCard,
      layout: 'transform',
    });
    expect(printing.layout).toBe('transform');
  });

  it('ignores foil when finish is unavailable', () => {
    const printing = mapScryfallCardToPrinting(
      { ...sampleCard, finishes: ['nonfoil'] },
      { foil: true },
    );
    expect(printing.foil).toBe(false);
  });
});

describe('searchCards / fetchPrintings', () => {
  it('searchCards returns page data from fetch', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [sampleCard],
        has_more: false,
        next_page: null,
        total_cards: 1,
      }),
    }));

    const page = await searchCards('sol ring', 1, { fetchImpl });
    expect(page.data).toHaveLength(1);
    expect(page.data[0].name).toBe('Sol Ring');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fetchPrintings caches by name', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [sampleCard] }),
    }));

    const first = await fetchPrintings('Sol Ring', { fetchImpl });
    const second = await fetchPrintings('Sol Ring', { fetchImpl });
    expect(first).toEqual([expect.objectContaining({ id: 'sf-sol' })]);
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fetchPrintings falls back to defaultScryfallId', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/cards/search')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: true, json: async () => sampleCard };
    });

    const result = await fetchPrintings('Obscure', {
      defaultScryfallId: 'sf-sol',
      fetchImpl,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sf-sol');
  });
});

describe('collectionIdentifierForCard / fetchCardsCollection', () => {
  it('prefers id, then set+cn, then name', () => {
    expect(
      collectionIdentifierForCard({
        scryfallId: 'sf-1',
        setCode: 'cmm',
        collectorNumber: '1',
        name: 'Sol Ring',
      }),
    ).toEqual({ id: 'sf-1' });
    expect(
      collectionIdentifierForCard({
        scryfallId: null,
        setCode: 'CMM',
        collectorNumber: '1',
        name: 'Sol Ring',
      }),
    ).toEqual({ set: 'cmm', collector_number: '1' });
    expect(
      collectionIdentifierForCard({
        scryfallId: null,
        setCode: null,
        collectorNumber: null,
        name: 'Sol Ring',
      }),
    ).toEqual({ name: 'Sol Ring' });
  });

  it('batches identifiers into chunks of 75', async () => {
    const ids = Array.from({ length: 80 }, (_, i) => ({ name: `Card ${i}` }));
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body || '{}')) as {
        identifiers: { name: string }[];
      };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: body.identifiers.map((id) => ({
            id: `sf-${id.name}`,
            name: id.name,
            set: 'lea',
            collector_number: '1',
          })),
          not_found: [],
        }),
      };
    });

    const result = await fetchCardsCollection(ids, {
      fetchImpl,
      delayMs: 0,
      chunkSize: 75,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.data).toHaveLength(80);
    expect(result.rateLimited).toBeFalsy();
  });

  it('stops and marks rateLimited on 429', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    }));

    const result = await fetchCardsCollection([{ name: 'Sol Ring' }], {
      fetchImpl,
      backoffMs: 0,
    });
    expect(result.data).toEqual([]);
    expect(result.rateLimited).toBe(true);
  });
});

describe('card edits', () => {
  it('defaultAddCategory prefers Maybeboard then aside then Other', () => {
    expect(defaultAddCategory(commander)).toBe('Other');
    expect(
      defaultAddCategory({
        categories: [
          { name: 'Maybeboard', includedInDeck: false, includedInPrice: false },
        ],
      }),
    ).toBe('Maybeboard');
    expect(
      defaultAddCategory({
        categories: [
          { name: 'Sideboard', includedInDeck: false, includedInPrice: false },
        ],
      }),
    ).toBe('Sideboard');
  });

  it('addCardToDeck appends a card and ensures category', () => {
    const printing = mapScryfallCardToPrinting(sampleCard);
    const next = addCardToDeck(commander, printing, 'Maybeboard', {
      nextId: () => 'c-new',
    });
    const added = next.cards.find((c) => c.instanceId === 'c-new');
    expect(added).toMatchObject({
      name: 'Sol Ring',
      primaryCategory: 'Maybeboard',
      scryfallId: 'sf-sol',
      setCode: 'cmm',
      collectorNumber: '1',
    });
    expect(next.categories.some((c) => c.name === 'Maybeboard')).toBe(true);
  });

  it('removeCardFromDeck scrubs formal swap refs', () => {
    const withSwap = {
      ...commander,
      formalSwapEntries: [
        {
          id: 's1',
          inInstanceId: 'c1',
          outInstanceId: 'c2',
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    const next = removeCardFromDeck(withSwap, 'c1');
    expect(next.cards.find((c) => c.instanceId === 'c1')).toBeUndefined();
    expect(next.formalSwapEntries[0].inInstanceId).toBeNull();
    expect(next.formalSwapEntries[0].outInstanceId).toBe('c2');
  });

  it('changeCardPrinting patches printing fields', () => {
    const printing = mapScryfallCardToPrinting({
      ...sampleCard,
      id: 'sf-new',
      set: 'mh3',
      collector_number: '42',
      layout: 'modal_dfc',
    });
    const next = changeCardPrinting(commander, 'c1', printing);
    const card = next.cards.find((c) => c.instanceId === 'c1');
    expect(card.scryfallId).toBe('sf-new');
    expect(card.setCode).toBe('mh3');
    expect(card.collectorNumber).toBe('42');
    expect(card.name).toBe('Sol Ring');
    expect(getOracle(next, card!)?.layout).toBe('modal_dfc');
    expect(oracleKey(card!)).toBe('id:sf-new');
  });

  it('applyPrintingToCard preserves instance identity', () => {
    const card = commander.cards[0];
    const printing = mapScryfallCardToPrinting(sampleCard, { foil: true });
    const next = applyPrintingToCard(card, printing);
    expect(next.instanceId).toBe(card.instanceId);
    expect(next.primaryCategory).toBe(card.primaryCategory);
    expect(next.foil).toBe(true);
  });
});
