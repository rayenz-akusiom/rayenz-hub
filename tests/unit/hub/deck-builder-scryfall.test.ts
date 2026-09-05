import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCardToDeck,
  applyPrintingToCard,
  buildInSetQuery,
  buildPrintingsSearchUrl,
  buildScopedSearchQueries,
  buildSearchUrl,
  cardMatchesSyntaxMembership,
  changeCardPrinting,
  clearInSetMembershipCache,
  clearOracleIdCache,
  clearScryfallPrintCache,
  collectionIdentifierForCard,
  defaultAddCategory,
  exactNameClause,
  fetchCardsCollection,
  fetchInSetMembership,
  fetchPrintings,
  fetchPrintingsPage,
  fetchCardById,
  fetchSyntaxMembership,
  getOracle,
  mapScryfallCardToPrinting,
  oracleIdClause,
  oracleKey,
  removeCardFromDeck,
  SCRYFALL_Q_MAX,
  searchCards,
  searchCardsNextPage,
  syntaxScopeKey,
  withPaperGameQuery,
} from '../../../packages/shared/src/index.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

function searchQuery(url: string): string {
  return new URL(url).searchParams.get('q') || '';
}

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
  clearInSetMembershipCache();
  clearOracleIdCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withPaperGameQuery', () => {
  it('wraps the query so or clauses stay fully constrained', () => {
    expect(withPaperGameQuery('t:creature or t:instant')).toBe(
      '(t:creature or t:instant) game:paper',
    );
  });

  it('does not wrap when game:paper is already present', () => {
    expect(withPaperGameQuery('t:instant game:paper')).toBe('t:instant game:paper');
    expect(withPaperGameQuery('GAME:PAPER t:instant')).toBe('GAME:PAPER t:instant');
  });

  it('returns empty input unchanged', () => {
    expect(withPaperGameQuery('')).toBe('');
    expect(withPaperGameQuery('   ')).toBe('');
  });
});

describe('scryfall URL builders', () => {
  it('builds search urls with query and page', () => {
    expect(searchQuery(buildSearchUrl('t:creature id:w', 1))).toBe(
      '(t:creature id:w) game:paper',
    );
    expect(buildSearchUrl('sol ring', 2)).toContain('page=2');
    expect(buildSearchUrl('sol ring', 1)).not.toContain('page=');
  });

  it('builds search urls with unique=cards for in-set membership', () => {
    const url = buildSearchUrl(buildInSetQuery(['CMM']), 1, { unique: 'cards' });
    expect(url).toContain('unique=cards');
    expect(searchQuery(url)).toBe('((in:cmm OR set:cmm)) game:paper');
  });

  it('builds exact-name printings search', () => {
    const url = buildPrintingsSearchUrl('Sol Ring');
    expect(url).toContain('unique=prints');
    expect(searchQuery(url)).toBe('(!"Sol Ring") game:paper');
  });

  it('builds printings search with set: clauses', () => {
    const url = buildPrintingsSearchUrl('Forest', 1, { setCodes: ['UNF', 'sld'] });
    expect(url).toContain('unique=prints');
    expect(searchQuery(url)).toBe('(!"Forest" (set:unf OR set:sld)) game:paper');
  });
});

describe('scoped syntax queries', () => {
  it('builds exact-name and oracleid clauses', () => {
    expect(exactNameClause('Sol Ring')).toBe('!"Sol Ring"');
    expect(exactNameClause('A "quoted" Name')).toBe('!"A quoted Name"');
    expect(oracleIdClause('e43e06fb-52b7-4f38-8fac-f31973b043f7')).toBe(
      'oracleid:e43e06fb-52b7-4f38-8fac-f31973b043f7',
    );
  });

  it('batches collection-scoped queries under the Scryfall q cap', () => {
    const clauses = Array.from({ length: 40 }, (_, i) =>
      oracleIdClause(`00000000-0000-0000-0000-${String(i).padStart(12, '0')}`),
    );
    const queries = buildScopedSearchQueries('t:creature', clauses);
    expect(queries.length).toBeGreaterThan(1);
    for (const q of queries) {
      expect(q.length).toBeLessThanOrEqual(SCRYFALL_Q_MAX);
      expect(withPaperGameQuery(q).length).toBeLessThanOrEqual(SCRYFALL_Q_MAX);
      expect(q.startsWith('(t:creature) (')).toBe(true);
      expect(q.endsWith(')')).toBe(true);
    }
    expect(queries.join(' ')).toContain('oracleid:00000000-0000-0000-0000-000000000000');
  });

  it('returns no queries when the user query or clauses are empty', () => {
    expect(buildScopedSearchQueries('', ['!"Sol Ring"'])).toEqual([]);
    expect(buildScopedSearchQueries('t:instant', [])).toEqual([]);
  });

  it('builds a stable scope key from ids then names', () => {
    expect(
      syntaxScopeKey([
        { name: 'Ponder', scryfallId: 'b' },
        { name: 'Sol Ring', scryfallId: 'a' },
        { name: 'Forest' },
      ]),
    ).toBe('a,b|forest');
  });
});

describe('cardMatchesSyntaxMembership', () => {
  it('treats null as off and empty as no matches', () => {
    expect(cardMatchesSyntaxMembership('Ponder', null)).toBe(true);
    expect(cardMatchesSyntaxMembership('Ponder', new Set())).toBe(false);
    expect(cardMatchesSyntaxMembership('Ponder', new Set(['ponder']))).toBe(true);
    expect(cardMatchesSyntaxMembership('Sol Ring', new Set(['ponder']))).toBe(false);
  });
});

describe('fetchSyntaxMembership', () => {
  it('resolves printing ids via collection then searches oracleid clauses', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/cards/collection')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 'print-1',
                oracle_id: 'oracle-ponder',
                name: 'Ponder',
                set: 'cmm',
                collector_number: '1',
              },
            ],
            not_found: [],
          }),
        };
      }
      const q = new URL(String(url)).searchParams.get('q') || '';
      expect(q).toContain('t:instant');
      expect(q).toContain('oracleid:oracle-ponder');
      expect(q).toContain('game:paper');
      expect(q).not.toContain('!"Ponder"');
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'print-1', name: 'Ponder', set: 'cmm', collector_number: '1' }],
          has_more: false,
          next_page: null,
        }),
      };
    });

    const names = await fetchSyntaxMembership(
      't:instant',
      [{ name: 'Ponder', scryfallId: 'print-1' }],
      { fetchImpl, delayMs: 0 },
    );
    expect(names.has('ponder')).toBe(true);
    expect(names.has('sol ring')).toBe(false);
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('/cards/collection'))).toBe(
      true,
    );

    await fetchSyntaxMembership('t:instant', [{ name: 'Ponder', scryfallId: 'print-1' }], {
      fetchImpl,
      delayMs: 0,
    });
    const collectionCalls = fetchImpl.mock.calls.filter((c) =>
      String(c[0]).includes('/cards/collection'),
    );
    expect(collectionCalls).toHaveLength(1);
  });

  it('uses exact-name clauses when cards have no scryfall id', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain('/cards/search');
      const q = new URL(String(url)).searchParams.get('q') || '';
      expect(q).toContain('!"Ponder"');
      expect(q).toContain('game:paper');
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'x', name: 'Ponder', set: 'cmm', collector_number: '1' }],
          has_more: false,
        }),
      };
    });
    const names = await fetchSyntaxMembership('o:draw', [{ name: 'Ponder' }], {
      fetchImpl,
      delayMs: 0,
    });
    expect(names.has('ponder')).toBe(true);
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('/cards/collection'))).toBe(
      false,
    );
  });

  it('falls back to exact-name search when collection fetch rejects', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('/cards/collection')) {
        throw new TypeError('Failed to fetch');
      }
      const q = new URL(String(url)).searchParams.get('q') || '';
      expect(q).toContain('t:instant');
      expect(q).toContain('!"Ponder"');
      expect(q).not.toContain('oracleid:');
      expect(q).toContain('game:paper');
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'print-1', name: 'Ponder', set: 'cmm', collector_number: '1' }],
          has_more: false,
          next_page: null,
        }),
      };
    });

    const names = await fetchSyntaxMembership(
      't:instant',
      [{ name: 'Ponder', scryfallId: 'print-fallback' }],
      { fetchImpl, delayMs: 0 },
    );
    expect(names.has('ponder')).toBe(true);
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('/cards/collection'))).toBe(
      true,
    );
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('/cards/search'))).toBe(true);
  });

  it('treats search 404 as an empty membership set', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));
    const names = await fetchSyntaxMembership('t:instant', [{ name: 'Ponder' }], {
      fetchImpl,
      delayMs: 0,
    });
    expect(names.size).toBe(0);
  });
});

describe('fetchInSetMembership', () => {
  it('pages unique=cards results into a name set and caches', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: '1', name: 'Sol Ring', set: 'cmm', collector_number: '1' },
            {
              id: '2',
              name: 'Delver of Secrets // Insectile Aberration',
              set: 'cmm',
              collector_number: '2',
            },
          ],
          has_more: true,
          next_page: 'https://api.scryfall.com/cards/search?page=2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: '3', name: 'Ponder', set: 'cmm', collector_number: '3' }],
          has_more: false,
          next_page: null,
        }),
      });

    const first = await fetchInSetMembership('cmm', { fetchImpl, delayMs: 0 });
    expect(searchQuery(String(fetchImpl.mock.calls[0]![0]))).toContain('game:paper');
    expect(first.has('sol ring')).toBe(true);
    expect(first.has('ponder')).toBe(true);
    expect(first.has('delver of secrets')).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const cached = await fetchInSetMembership('CMM', { fetchImpl, delayMs: 0 });
    expect(cached).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
      finishes: ['nonfoil', 'foil'],
      manaCost: null,
      producedMana: null,
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
    expect(searchQuery(String(fetchImpl.mock.calls[0]![0]))).toBe('(sol ring) game:paper');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fetchPrintings caches by name', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [sampleCard], has_more: false, next_page: null }),
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

  it('fetchPrintingsPage returns has_more and next_page', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [sampleCard],
        has_more: true,
        next_page: 'https://api.scryfall.com/cards/search?page=2',
        total_cards: 200,
      }),
    }));

    const page = await fetchPrintingsPage('Forest', 1, { fetchImpl });
    expect(page.data).toHaveLength(1);
    expect(page.has_more).toBe(true);
    expect(page.next_page).toContain('page=2');
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('unique=prints');
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('order=released');
    expect(searchQuery(String(fetchImpl.mock.calls[0]![0]))).toBe('(!"Forest") game:paper');
  });

  it('fetchPrintingsPage page 2 hits page query param', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [sampleCard], has_more: false, next_page: null }),
    }));
    await fetchPrintingsPage('Forest', 2, { fetchImpl, delayMs: 0 });
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('page=2');
  });

  it('fetchPrintingsPage passes set codes into the search URL', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [sampleCard], has_more: false, next_page: null }),
    }));
    await fetchPrintingsPage('Forest', 1, { fetchImpl, setCodes: ['UNF'] });
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('set%3Aunf');
  });

  it('fetchPrintingsPage returns empty on 404 when set-filtered', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));
    const page = await fetchPrintingsPage('Forest', 1, {
      fetchImpl,
      setCodes: ['zzz'],
      defaultScryfallId: 'sf-sol',
    });
    expect(page.data).toEqual([]);
    expect(page.has_more).toBe(false);
    expect(page.next_page).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fetchPrintingsPage treats unfiltered 404 as empty when nothing to pin', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));
    const page = await fetchPrintingsPage('Forest', 1, { fetchImpl });
    expect(page.data).toEqual([]);
    expect(page.has_more).toBe(false);
  });

  it('fetchCardById returns a card or null', async () => {
    const okFetch = vi.fn(async () => ({
      ok: true,
      json: async () => sampleCard,
    }));
    const card = await fetchCardById('sf-sol', { fetchImpl: okFetch });
    expect(card?.name).toBe('Sol Ring');

    const missFetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));
    expect(await fetchCardById('missing', { fetchImpl: missFetch })).toBeNull();
  });

  it('searchCardsNextPage appends from next_page url', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ ...sampleCard, id: 'sf-sol-2', set: 'mh2' }],
        has_more: false,
        next_page: null,
      }),
    }));
    const page = await searchCardsNextPage('https://api.scryfall.com/cards/search?page=2', {
      fetchImpl,
      delayMs: 0,
    });
    expect(page.data[0]!.id).toBe('sf-sol-2');
    expect(page.has_more).toBe(false);
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
