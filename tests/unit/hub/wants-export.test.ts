import { describe, it, expect } from 'vitest';
import {
  buildArchidektWantsText,
  buildNameQtyWantsText,
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
