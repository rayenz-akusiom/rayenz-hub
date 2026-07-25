import { describe, expect, it } from 'vitest';
import { buildGlanceIncludeSet, syncCardsWithFormalSwaps } from '@rayenz-hub/shared';
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
    for (const card of result.includeSet.cards) {
      if (card.imageUrl?.includes('cards.scryfall.io')) {
        expect(card.imageUrl).toContain('/normal/');
      }
    }
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

  it('stays eligible when swapping one basic from a multi-qty forest stack', () => {
    const base = buildEligibleCommanderDeck();
    const swapIn = {
      instanceId: 'swap-in-basic',
      name: 'Swap In Land',
      quantity: 1,
      primaryCategory: 'Land',
      categories: ['Land'],
      stack: null,
      setCode: 'm12',
      collectorNumber: '998',
      scryfallId: null,
      archidektCardId: null,
      foil: false,
      proxy: false,
    };
    let n = 0;
    const queued = syncCardsWithFormalSwaps(
      {
        ...base,
        cards: [...base.cards, swapIn],
        formalSwapEntries: [
          {
            id: 'swap-basic-1',
            inInstanceId: 'swap-in-basic',
            outInstanceId: 'forest-stack',
            inTargetCategory: 'Land',
            sortIndex: 0,
            notes: null,
          },
        ],
      },
      undefined,
      { nextId: () => `forest-out-${++n}` },
    );
    const forest = queued.cards.find((c) => c.instanceId === 'forest-stack')!;
    expect(forest.quantity).toBe(18);
    expect(queued.formalSwapEntries[0]!.outInstanceId).toBe('forest-out-1');

    const result = buildGlanceIncludeSet(queued);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeSet.quantitySum).toBe(100);
    expect(result.includeSet.cards.some((c) => c.instanceId === 'forest-out-1')).toBe(false);
    expect(result.includeSet.cards.some((c) => c.instanceId === 'swap-in-basic')).toBe(true);
  });
});
