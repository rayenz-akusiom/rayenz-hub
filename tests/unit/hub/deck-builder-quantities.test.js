import { describe, it, expect } from 'vitest';
import {
  isBasicLand,
  normalizeCardQuantities,
} from '../../../packages/shared/src/deck-builder/quantities.ts';
import { partitionCategories } from '../../../packages/shared/src/deck-builder/browse.ts';
import { documentFromArchidektSnapshot } from '../../../packages/web/src/deck-builder/import-export/import-deck.ts';

describe('quantities', () => {
  it('detects basic lands by name and type line', () => {
    expect(isBasicLand({ name: 'Forest', typeLine: null })).toBe(true);
    expect(isBasicLand({ name: 'Snow-Covered Island', typeLine: null })).toBe(true);
    expect(isBasicLand({ name: 'Sol Ring', typeLine: 'Artifact' })).toBe(false);
    expect(isBasicLand({ name: 'Unknown', typeLine: 'Basic Land — Forest' })).toBe(true);
  });

  it('commander keeps basic qty and expands non-basics', () => {
    const cards = [
      {
        instanceId: 'f1',
        name: 'Forest',
        quantity: 3,
        primaryCategory: 'Land',
        categories: ['Land'],
        stack: null,
        setCode: null,
        collectorNumber: null,
        scryfallId: null,
        colourIdentity: ['G'],
        typeLine: 'Basic Land — Forest',
        archidektCardId: null,
        foil: false,
      },
      {
        instanceId: 's1',
        name: 'Sol Ring',
        quantity: 2,
        primaryCategory: 'Artifact',
        categories: ['Artifact'],
        stack: null,
        setCode: null,
        collectorNumber: null,
        scryfallId: null,
        colourIdentity: [],
        typeLine: 'Artifact',
        archidektCardId: null,
        foil: false,
      },
    ];
    const out = normalizeCardQuantities(cards, 'commander', (p) => `${p}-x`);
    expect(out.filter((c) => c.name === 'Forest')).toHaveLength(1);
    expect(out.find((c) => c.name === 'Forest')?.quantity).toBe(3);
    expect(out.filter((c) => c.name === 'Sol Ring')).toHaveLength(2);
    expect(out.every((c) => c.name !== 'Sol Ring' || c.quantity === 1)).toBe(true);
  });

  it('cube keeps multi-qty as-is', () => {
    const cards = [
      {
        instanceId: 'a1',
        name: 'Lightning Bolt',
        quantity: 4,
        primaryCategory: 'Instant',
        categories: ['Instant'],
        stack: null,
        setCode: null,
        collectorNumber: null,
        scryfallId: null,
        colourIdentity: ['R'],
        typeLine: 'Instant',
        archidektCardId: null,
        foil: false,
      },
    ];
    const out = normalizeCardQuantities(cards, 'cube');
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(4);
  });
});

describe('foil import', () => {
  it('maps modifier Foil and boolean foil', () => {
    const doc = documentFromArchidektSnapshot({
      deck_id: 1,
      name: 'Foil Test',
      categories: [{ name: 'Creature', includedInDeck: true, includedInPrice: true }],
      cards: [
        {
          id: 1,
          name: 'Birds of Paradise',
          quantity: 1,
          primary_category: 'Creature',
          categories: ['Creature'],
          modifier: 'Foil',
        },
        {
          id: 2,
          name: 'Llanowar Elves',
          quantity: 1,
          primary_category: 'Creature',
          categories: ['Creature'],
          foil: true,
        },
      ],
    });
    expect(doc.cards.every((c) => c.foil)).toBe(true);
  });
});

describe('partitionCategories', () => {
  it('splits header, included, and excluded', () => {
    const deck = {
      categories: [
        { name: 'Commander', includedInDeck: true, includedInPrice: true },
        { name: 'Creature', includedInDeck: true, includedInPrice: true },
        { name: 'Maybeboard', includedInDeck: false, includedInPrice: true },
        { name: 'New Set Out', includedInDeck: false, includedInPrice: false },
      ],
      cards: [
        {
          instanceId: '1',
          name: 'Atraxa',
          quantity: 1,
          primaryCategory: 'Commander',
          categories: ['Commander'],
          stack: null,
          setCode: null,
          collectorNumber: null,
          scryfallId: null,
          colourIdentity: [],
          typeLine: null,
          archidektCardId: null,
          foil: false,
        },
        {
          instanceId: '2',
          name: 'Bear',
          quantity: 1,
          primaryCategory: 'Creature',
          categories: ['Creature'],
          stack: null,
          setCode: null,
          collectorNumber: null,
          scryfallId: null,
          colourIdentity: [],
          typeLine: null,
          archidektCardId: null,
          foil: false,
        },
        {
          instanceId: '3',
          name: 'Maybe',
          quantity: 1,
          primaryCategory: 'Maybeboard',
          categories: ['Maybeboard'],
          stack: null,
          setCode: null,
          collectorNumber: null,
          scryfallId: null,
          colourIdentity: [],
          typeLine: null,
          archidektCardId: null,
          foil: false,
        },
      ],
    };
    const p = partitionCategories(deck);
    expect(p.headerKeys).toEqual(['Commander']);
    expect(p.includedKeys).toEqual(['Creature']);
    expect(p.excludedKeys).toContain('Maybeboard');
    expect(p.included.Creature).toHaveLength(1);
    expect(p.excluded.Maybeboard).toHaveLength(1);
  });
});
