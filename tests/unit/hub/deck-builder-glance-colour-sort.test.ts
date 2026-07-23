import { describe, expect, it } from 'vitest';
import { compareGlanceCardsForColourSort, type GlanceCard } from '@rayenz-hub/shared';

function card(partial: Partial<GlanceCard> & Pick<GlanceCard, 'name' | 'instanceId'>): GlanceCard {
  return {
    setCode: null,
    collectorNumber: null,
    typeLine: null,
    colours: [],
    primaryCategory: null,
    quantity: 1,
    imageUrl: null,
    isBasicLand: false,
    isLand: false,
    ...partial,
  };
}

describe('deck-builder glance colour-sort', () => {
  it('orders mono U before multicolor before colorless', () => {
    const counterspell = card({ instanceId: 'u', name: 'Counterspell', colours: ['U'] });
    const abrupt = card({ instanceId: 'bg', name: 'Abrupt Decay', colours: ['B', 'G'] });
    const sol = card({ instanceId: 'c', name: 'Sol Ring', colours: [] });
    const sorted = [sol, abrupt, counterspell].sort(compareGlanceCardsForColourSort);
    expect(sorted.map((c) => c.name)).toEqual(['Counterspell', 'Abrupt Decay', 'Sol Ring']);
  });

  it('uses name/set/collector/instance secondary keys within the same colour bucket', () => {
    const a = card({ instanceId: 'a', name: 'Alpha', setCode: 'm12', collectorNumber: '1', colours: ['U'] });
    const b = card({ instanceId: 'b', name: 'Alpha', setCode: 'm13', collectorNumber: '1', colours: ['U'] });
    expect(compareGlanceCardsForColourSort(a, b)).toBeLessThan(0);
  });
});
