import { describe, it, expect } from 'vitest';
import {
  buildArchidektWantsText,
  buildNameQtyWantsText,
  filterWantSources,
  passesDeckFilter,
  passesPriceFilter,
} from '../../../packages/shared/src/mtg/wants-export.ts';
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
});
