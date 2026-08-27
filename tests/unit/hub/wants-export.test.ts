import { describe, it, expect } from 'vitest';
import {
  buildArchidektWantsText,
  buildNameQtyWantsText,
  filterWantSources,
  formalSwapMatchesSetMembership,
  isMainDeckWantSource,
  passesDeckFilter,
  passesPriceFilter,
  passesSetFilter,
} from '../../../packages/shared/src/mtg/wants-export.ts';
import type { DeckDocument } from '../../../packages/shared/src/schemas/deck-builder.ts';
import {
  buildInSetQuery,
  cardMatchesSetMembership,
  normalizeSetCodes,
} from '../../../packages/shared/src/deck-builder/scryfall-api.ts';
import type { WantSource } from '../../../packages/shared/src/mtg/wants-aggregate.ts';

function src(over: Partial<WantSource> & Pick<WantSource, 'cardName' | 'mergeKey' | 'quantity'>): WantSource {
  return {
    deckId: 'd',
    deckName: 'D',
    format: 'commander',
    kind: 'seeking',
    entryId: 'e',
    cardInstanceId: 'c',
    usd: null,
    setCode: null,
    collectorNumber: null,
    foil: false,
    outInstanceId: null,
    inInstanceId: null,
    pairIncomplete: false,
    ...over,
  };
}

describe('wants-export', () => {
  it('includes unpriced when min filter active', () => {
    expect(passesPriceFilter(src({ cardName: 'A', mergeKey: 'a', quantity: 1, usd: null }), { minUsd: 5 })).toBe(
      true,
    );
    expect(passesPriceFilter(src({ cardName: 'B', mergeKey: 'b', quantity: 1, usd: 1 }), { minUsd: 5 })).toBe(
      false,
    );
    expect(passesPriceFilter(src({ cardName: 'C', mergeKey: 'c', quantity: 1, usd: 10 }), { minUsd: 5 })).toBe(
      true,
    );
    expect(passesPriceFilter(src({ cardName: 'D', mergeKey: 'd', quantity: 1, usd: 1 }), { minUsd: null })).toBe(
      true,
    );
  });

  it('applies maxUsd and keeps unpriced', () => {
    expect(
      passesPriceFilter(src({ cardName: 'A', mergeKey: 'a', quantity: 1, usd: null }), {
        minUsd: null,
        maxUsd: 5,
      }),
    ).toBe(true);
    expect(
      passesPriceFilter(src({ cardName: 'B', mergeKey: 'b', quantity: 1, usd: 10 }), {
        minUsd: null,
        maxUsd: 5,
      }),
    ).toBe(false);
    expect(
      passesPriceFilter(src({ cardName: 'C', mergeKey: 'c', quantity: 1, usd: 3 }), {
        minUsd: null,
        maxUsd: 5,
      }),
    ).toBe(true);
    expect(
      passesPriceFilter(src({ cardName: 'D', mergeKey: 'd', quantity: 1, usd: 3 }), {
        minUsd: 2,
        maxUsd: 5,
      }),
    ).toBe(true);
    expect(
      passesPriceFilter(src({ cardName: 'E', mergeKey: 'e', quantity: 1, usd: 1 }), {
        minUsd: 2,
        maxUsd: 5,
      }),
    ).toBe(false);
  });

  it('passes deck filter when deckIds null or empty', () => {
    const s = src({ cardName: 'A', mergeKey: 'a', quantity: 1, deckId: 'd1' });
    expect(passesDeckFilter(s, { minUsd: null })).toBe(true);
    expect(passesDeckFilter(s, { minUsd: null, deckIds: null })).toBe(true);
    expect(passesDeckFilter(s, { minUsd: null, deckIds: [] })).toBe(true);
  });

  it('restricts to selected deckIds', () => {
    const a = src({ cardName: 'A', mergeKey: 'a', quantity: 1, deckId: 'd1' });
    const b = src({ cardName: 'B', mergeKey: 'b', quantity: 1, deckId: 'd2' });
    expect(passesDeckFilter(a, { minUsd: null, deckIds: ['d1'] })).toBe(true);
    expect(passesDeckFilter(b, { minUsd: null, deckIds: ['d1'] })).toBe(false);
    expect(filterWantSources([a, b], { minUsd: null, deckIds: ['d2'] })).toEqual([b]);
  });

  it('applies price and deck filters together', () => {
    const cheap = src({
      cardName: 'Cheap',
      mergeKey: 'cheap',
      quantity: 1,
      deckId: 'd1',
      usd: 1,
    });
    const pricey = src({
      cardName: 'Pricey',
      mergeKey: 'pricey',
      quantity: 1,
      deckId: 'd1',
      usd: 20,
    });
    const other = src({
      cardName: 'Other',
      mergeKey: 'other',
      quantity: 1,
      deckId: 'd2',
      usd: 20,
    });
    expect(
      filterWantSources([cheap, pricey, other], { minUsd: 5, deckIds: ['d1'] }).map((s) => s.cardName),
    ).toEqual(['Pricey']);
  });

  it('combines by mergeKey and omits outs (sources are acquire-only)', () => {
    const sources = [
      src({ cardName: 'Sol Ring', mergeKey: 'sol ring', quantity: 1, entryId: '1' }),
      src({ cardName: 'Sol Ring', mergeKey: 'sol ring', quantity: 2, entryId: '2', deckId: 'd2' }),
      src({ cardName: 'Counterspell', mergeKey: 'counterspell', quantity: 1, entryId: '3' }),
    ];
    const arch = buildArchidektWantsText(sources);
    expect(arch).toContain('// Seeking / Queued In (combined)');
    expect(arch).toContain('3 Sol Ring');
    expect(arch).toContain('1 Counterspell');
    expect(arch).not.toMatch(/Queued Out|Cut Card/);

    const nameQty = buildNameQtyWantsText(sources);
    expect(nameQty).toContain('3 Sol Ring');
    expect(nameQty).not.toContain('//');
  });

  it('passes set filter when membership null or empty', () => {
    const s = src({ cardName: 'Sol Ring', mergeKey: 'sol ring', quantity: 1 });
    expect(passesSetFilter(s, null)).toBe(true);
    expect(passesSetFilter(s, new Set())).toBe(true);
  });

  it('keeps both sides of a swap when either face matches set membership', () => {
    const membership = new Set(['sol ring']);
    const queuedIn = src({
      kind: 'queued_in',
      entryId: 'pair-1',
      cardName: 'Sol Ring',
      mergeKey: 'sol ring',
      quantity: 1,
      inInstanceId: 'in1',
      outInstanceId: 'out1',
    });
    const queuedOut = src({
      kind: 'queued_out',
      entryId: 'pair-1',
      cardName: 'Worn Powerstone',
      mergeKey: 'worn powerstone',
      quantity: 1,
      cardInstanceId: 'out1',
      inInstanceId: 'in1',
      outInstanceId: 'out1',
    });
    const otherOut = src({
      kind: 'queued_out',
      entryId: 'pair-2',
      cardName: 'Island',
      mergeKey: 'island',
      quantity: 1,
      cardInstanceId: 'out2',
    });
    const visible = filterWantSources([queuedIn, queuedOut, otherOut], {
      minUsd: null,
      setMembership: membership,
    });
    expect(visible.map((s) => `${s.kind}:${s.cardName}`).sort()).toEqual([
      'queued_in:Sol Ring',
      'queued_out:Worn Powerstone',
    ]);
  });

  it('keeps both sides of a swap when either face matches syntax membership', () => {
    const syntax = new Set(['sol ring']);
    const queuedIn = src({
      kind: 'queued_in',
      entryId: 'pair-1',
      cardName: 'Sol Ring',
      mergeKey: 'sol ring',
      quantity: 1,
      inInstanceId: 'in1',
      outInstanceId: 'out1',
    });
    const queuedOut = src({
      kind: 'queued_out',
      entryId: 'pair-1',
      cardName: 'Worn Powerstone',
      mergeKey: 'worn powerstone',
      quantity: 1,
      cardInstanceId: 'out1',
      inInstanceId: 'in1',
      outInstanceId: 'out1',
    });
    const other = src({
      kind: 'seeking',
      entryId: 's1',
      cardName: 'Island',
      mergeKey: 'island',
      quantity: 1,
    });
    const visible = filterWantSources([queuedIn, queuedOut, other], {
      minUsd: null,
      syntaxMembership: syntax,
    });
    expect(visible.map((s) => `${s.kind}:${s.cardName}`).sort()).toEqual([
      'queued_in:Sol Ring',
      'queued_out:Worn Powerstone',
    ]);
  });

  it('hides seeking when syntax membership is empty (no hits)', () => {
    const a = src({
      kind: 'seeking',
      cardName: 'Ponder',
      mergeKey: 'ponder',
      quantity: 1,
      entryId: 's1',
    });
    expect(filterWantSources([a], { minUsd: null, syntaxMembership: new Set() })).toEqual([]);
  });

  it('filters seeking individually by set membership', () => {
    const membership = new Set(['counterspell']);
    const a = src({
      kind: 'seeking',
      cardName: 'Counterspell',
      mergeKey: 'counterspell',
      quantity: 1,
      entryId: 's1',
    });
    const b = src({
      kind: 'seeking',
      cardName: 'Ponder',
      mergeKey: 'ponder',
      quantity: 1,
      entryId: 's2',
    });
    expect(
      filterWantSources([a, b], { minUsd: null, setMembership: membership }).map((s) => s.cardName),
    ).toEqual(['Counterspell']);
  });

  it('excludes seeking that match exclude membership', () => {
    const exclude = new Set(['ponder']);
    const a = src({
      kind: 'seeking',
      cardName: 'Counterspell',
      mergeKey: 'counterspell',
      quantity: 1,
      entryId: 's1',
    });
    const b = src({
      kind: 'seeking',
      cardName: 'Ponder',
      mergeKey: 'ponder',
      quantity: 1,
      entryId: 's2',
    });
    expect(
      filterWantSources([a, b], { minUsd: null, setExcludeMembership: exclude }).map(
        (s) => s.cardName,
      ),
    ).toEqual(['Counterspell']);
  });

  it('drops a pair when acquire In matches exclude membership', () => {
    const exclude = new Set(['sol ring']);
    const queuedIn = src({
      kind: 'queued_in',
      entryId: 'pair-1',
      cardName: 'Sol Ring',
      mergeKey: 'sol ring',
      quantity: 1,
      inInstanceId: 'in1',
      outInstanceId: 'out1',
    });
    const queuedOut = src({
      kind: 'queued_out',
      entryId: 'pair-1',
      cardName: 'Worn Powerstone',
      mergeKey: 'worn powerstone',
      quantity: 1,
      cardInstanceId: 'out1',
      inInstanceId: 'in1',
      outInstanceId: 'out1',
    });
    expect(
      filterWantSources([queuedIn, queuedOut], {
        minUsd: null,
        setExcludeMembership: exclude,
      }),
    ).toEqual([]);
  });

  it('keeps pair when only Out matches exclude and In does not', () => {
    const exclude = new Set(['worn powerstone']);
    const queuedIn = src({
      kind: 'queued_in',
      entryId: 'pair-1',
      cardName: 'Sol Ring',
      mergeKey: 'sol ring',
      quantity: 1,
      inInstanceId: 'in1',
      outInstanceId: 'out1',
    });
    const queuedOut = src({
      kind: 'queued_out',
      entryId: 'pair-1',
      cardName: 'Worn Powerstone',
      mergeKey: 'worn powerstone',
      quantity: 1,
      cardInstanceId: 'out1',
      inInstanceId: 'in1',
      outInstanceId: 'out1',
    });
    const visible = filterWantSources([queuedIn, queuedOut], {
      minUsd: null,
      setExcludeMembership: exclude,
    });
    expect(visible.map((s) => s.kind).sort()).toEqual(['queued_in', 'queued_out']);
  });

  it('applies include AND NOT exclude together', () => {
    const include = new Set(['sol ring', 'ponder']);
    const exclude = new Set(['ponder']);
    const a = src({
      kind: 'seeking',
      cardName: 'Sol Ring',
      mergeKey: 'sol ring',
      quantity: 1,
      entryId: 's1',
    });
    const b = src({
      kind: 'seeking',
      cardName: 'Ponder',
      mergeKey: 'ponder',
      quantity: 1,
      entryId: 's2',
    });
    const c = src({
      kind: 'seeking',
      cardName: 'Island',
      mergeKey: 'island',
      quantity: 1,
      entryId: 's3',
    });
    expect(
      filterWantSources([a, b, c], {
        minUsd: null,
        setMembership: include,
        setExcludeMembership: exclude,
      }).map((s) => s.cardName),
    ).toEqual(['Sol Ring']);
  });

  it('matches formal swaps when either side is in membership', () => {
    const membership = new Set(['sol ring']);
    const names: Record<string, string> = {
      in1: 'Ponder',
      out1: 'Sol Ring',
    };
    expect(
      formalSwapMatchesSetMembership(
        { inInstanceId: 'in1', outInstanceId: 'out1' },
        (id) => (id ? names[id] : null),
        membership,
      ),
    ).toBe(true);
    expect(
      formalSwapMatchesSetMembership(
        { inInstanceId: 'in1', outInstanceId: null },
        (id) => (id ? names[id] : null),
        membership,
      ),
    ).toBe(false);
    expect(
      formalSwapMatchesSetMembership(
        { inInstanceId: 'in1', outInstanceId: 'out1' },
        (id) => (id ? names[id] : null),
        null,
      ),
    ).toBe(true);
  });

  it('isMainDeckWantSource keeps secondary Seeking on main-deck primary', () => {
    const deck: DeckDocument = {
      schemaVersion: 1,
      deckId: 'd1',
      name: 'Test',
      format: 'commander',
      archidektId: null,
      archidektUrl: null,
      categories: [{ name: 'Creature', includedInDeck: true, includedInPrice: true, target: null }],
      cards: [
        {
          instanceId: 'c1',
          name: 'Birds of Paradise',
          primaryCategory: 'Creature',
          categories: ['Creature', 'Seeking'],
          quantity: 1,
          foil: false,
          proxy: false,
          scryfallId: 'x',
          setCode: 'm10',
          collectorNumber: '1',
          layout: 'normal',
          typeLine: 'Creature',
          colourIdentity: ['G'],
          printedName: null,
          flavorName: null,
          manaValue: 1,
        },
      ],
      oracle: {},
      formalSwapEntries: [],
      lookingForEntries: [{ id: 'lf1', instanceId: 'c1', sortIndex: 0, notes: null }],
      coverInstanceId: null,
      browseViewDefault: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastArchidektSyncAt: null,
      lastArchidektImportAt: null,
    };
    const seeking = src({
      kind: 'seeking',
      deckId: 'd1',
      cardInstanceId: 'c1',
      entryId: 'lf1',
      cardName: 'Birds of Paradise',
      mergeKey: 'birds of paradise',
      quantity: 1,
    });
    expect(isMainDeckWantSource(seeking, deck)).toBe(true);
  });

  it('isMainDeckWantSource rejects primary Seeking, maybeboard, and swap pairs', () => {
    const deck: DeckDocument = {
      schemaVersion: 1,
      deckId: 'd1',
      name: 'Test',
      format: 'commander',
      archidektId: null,
      archidektUrl: null,
      categories: [
        { name: 'Creature', includedInDeck: true, includedInPrice: true, target: null },
        { name: 'Maybeboard', includedInDeck: false, includedInPrice: false, target: null },
        { name: 'Seeking', includedInDeck: false, includedInPrice: false, target: null },
      ],
      cards: [
        {
          instanceId: 'aside',
          name: 'Aside Seek',
          primaryCategory: 'Seeking',
          categories: ['Seeking'],
          quantity: 1,
          foil: false,
          proxy: false,
          scryfallId: 'a',
          setCode: 'm10',
          collectorNumber: '1',
          layout: 'normal',
          typeLine: 'Instant',
          colourIdentity: ['U'],
          printedName: null,
          flavorName: null,
          manaValue: 1,
        },
        {
          instanceId: 'mb',
          name: 'Maybe Card',
          primaryCategory: 'Maybeboard',
          categories: ['Maybeboard'],
          quantity: 1,
          foil: false,
          proxy: false,
          scryfallId: 'b',
          setCode: 'm10',
          collectorNumber: '2',
          layout: 'normal',
          typeLine: 'Instant',
          colourIdentity: ['U'],
          printedName: null,
          flavorName: null,
          manaValue: 1,
        },
      ],
      oracle: {},
      formalSwapEntries: [],
      lookingForEntries: [],
      coverInstanceId: null,
      browseViewDefault: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastArchidektSyncAt: null,
      lastArchidektImportAt: null,
    };
    expect(
      isMainDeckWantSource(
        src({
          kind: 'seeking',
          deckId: 'd1',
          cardInstanceId: 'aside',
          entryId: 'lf1',
          cardName: 'Aside Seek',
          mergeKey: 'aside seek',
          quantity: 1,
        }),
        deck,
      ),
    ).toBe(false);
    expect(
      isMainDeckWantSource(
        src({
          kind: 'seeking',
          deckId: 'd1',
          cardInstanceId: 'mb',
          entryId: 'lf2',
          cardName: 'Maybe Card',
          mergeKey: 'maybe card',
          quantity: 1,
        }),
        deck,
      ),
    ).toBe(false);
    expect(
      isMainDeckWantSource(
        src({
          kind: 'queued_in',
          deckId: 'd1',
          cardInstanceId: 'in1',
          entryId: 'p1',
          cardName: 'In',
          mergeKey: 'in',
          quantity: 1,
        }),
        deck,
      ),
    ).toBe(false);
  });

  it('filterWantSources applies mainDeckOnly with deck context', () => {
    const deck: DeckDocument = {
      schemaVersion: 1,
      deckId: 'd1',
      name: 'Test',
      format: 'commander',
      archidektId: null,
      archidektUrl: null,
      categories: [
        { name: 'Creature', includedInDeck: true, includedInPrice: true, target: null },
        { name: 'Seeking', includedInDeck: false, includedInPrice: false, target: null },
      ],
      cards: [
        {
          instanceId: 'main',
          name: 'Main Seek',
          primaryCategory: 'Creature',
          categories: ['Creature', 'Seeking'],
          quantity: 1,
          foil: false,
          proxy: false,
          scryfallId: 'm',
          setCode: 'm10',
          collectorNumber: '1',
          layout: 'normal',
          typeLine: 'Creature',
          colourIdentity: ['G'],
          printedName: null,
          flavorName: null,
          manaValue: 1,
        },
        {
          instanceId: 'aside',
          name: 'Aside Seek',
          primaryCategory: 'Seeking',
          categories: ['Seeking'],
          quantity: 1,
          foil: false,
          proxy: false,
          scryfallId: 'a',
          setCode: 'm10',
          collectorNumber: '2',
          layout: 'normal',
          typeLine: 'Instant',
          colourIdentity: ['U'],
          printedName: null,
          flavorName: null,
          manaValue: 1,
        },
      ],
      oracle: {},
      formalSwapEntries: [],
      lookingForEntries: [],
      coverInstanceId: null,
      browseViewDefault: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastArchidektSyncAt: null,
      lastArchidektImportAt: null,
    };
    const main = src({
      kind: 'seeking',
      deckId: 'd1',
      cardInstanceId: 'main',
      entryId: 'lf1',
      cardName: 'Main Seek',
      mergeKey: 'main seek',
      quantity: 1,
    });
    const aside = src({
      kind: 'seeking',
      deckId: 'd1',
      cardInstanceId: 'aside',
      entryId: 'lf2',
      cardName: 'Aside Seek',
      mergeKey: 'aside seek',
      quantity: 1,
    });
    const pairIn = src({
      kind: 'queued_in',
      deckId: 'd1',
      cardInstanceId: 'in1',
      entryId: 'p1',
      cardName: 'Sol Ring',
      mergeKey: 'sol ring',
      quantity: 1,
    });
    const visible = filterWantSources([main, aside, pairIn], { minUsd: null, mainDeckOnly: true }, {
      deckById: new Map([['d1', deck]]),
    });
    expect(visible.map((s) => s.cardName)).toEqual(['Main Seek']);
  });
});

describe('scryfall in-set helpers', () => {
  it('normalizes set codes and builds in:/set: query', () => {
    expect(normalizeSetCodes('mh3, MSC mh3')).toEqual(['MH3', 'MSC']);
    expect(buildInSetQuery(['MH3'])).toBe('(in:mh3 OR set:mh3)');
    expect(buildInSetQuery(['MH3', 'MSC'])).toBe('(in:mh3 OR set:mh3 OR in:msc OR set:msc)');
  });

  it('matches card names and DFC front faces against membership', () => {
    const membership = new Set(['delver of secrets', 'insectile aberration']);
    expect(cardMatchesSetMembership('Delver of Secrets', membership)).toBe(true);
    expect(cardMatchesSetMembership('Delver of Secrets // Insectile Aberration', membership)).toBe(
      true,
    );
    expect(cardMatchesSetMembership('Ponder', membership)).toBe(false);
    expect(cardMatchesSetMembership('Ponder', null)).toBe(true);
  });

  it('ignores basic lands even when they appear in membership', () => {
    const membership = new Set(['forest', 'sol ring', 'snow-covered island']);
    expect(cardMatchesSetMembership('Forest', membership)).toBe(false);
    expect(cardMatchesSetMembership('Snow-Covered Island', membership)).toBe(false);
    expect(cardMatchesSetMembership('Sol Ring', membership)).toBe(true);
    expect(cardMatchesSetMembership('Forest', null)).toBe(true);
  });

  it('does not keep a swap pair that only matches via a basic land', () => {
    const membership = new Set(['forest', 'island']);
    const queuedIn = src({
      kind: 'queued_in',
      entryId: 'pair-land',
      cardName: 'Ponder',
      mergeKey: 'ponder',
      quantity: 1,
    });
    const queuedOut = src({
      kind: 'queued_out',
      entryId: 'pair-land',
      cardName: 'Forest',
      mergeKey: 'forest',
      quantity: 1,
      cardInstanceId: 'out1',
    });
    expect(
      filterWantSources([queuedIn, queuedOut], { minUsd: null, setMembership: membership }),
    ).toEqual([]);
  });
});
