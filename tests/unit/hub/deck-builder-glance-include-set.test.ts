import { describe, expect, it } from 'vitest';
import { buildGlanceIncludeSet } from '@rayenz-hub/shared';
import { buildEligibleCommanderDeck } from '../../fixtures/deck-builder/glance-eligible.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

describe('deck-builder glance include-set', () => {
  it('accepts a 100-card eligible commander deck', () => {
    const deck = buildEligibleCommanderDeck();
    const result = buildGlanceIncludeSet(deck);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeSet.quantitySum).toBe(100);
    expect(result.includeSet.commanders).toHaveLength(1);
  });

  it('rejects decks whose include-set is not exactly 100', () => {
    const result = buildGlanceIncludeSet(commander as never);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('GLANCE_NOT_ELIGIBLE');
  });

  it('excludes maybeboard from the include-set count', () => {
    const base = buildEligibleCommanderDeck();
    const deck = buildEligibleCommanderDeck({
      cards: [
        ...base.cards,
        {
          instanceId: 'maybe-1',
          name: 'Maybe Card',
          quantity: 1,
          primaryCategory: 'Maybeboard',
          categories: ['Maybeboard'],
          stack: null,
          setCode: 'm12',
          collectorNumber: '999',
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
      ],
      categories: [
        ...(base.categories || []),
        { name: 'Maybeboard', includedInDeck: false, includedInPrice: false },
      ],
    });
    const result = buildGlanceIncludeSet(deck);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeSet.cards.some((c) => c.instanceId === 'maybe-1')).toBe(false);
  });
});
