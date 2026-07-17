import { describe, it, expect } from 'vitest';
import {
  normalizeColourIdentity,
  mapColourIdentityToken,
} from '../../../packages/shared/src/deck-builder/color-identity-map.ts';
import { partitionCategories } from '../../../packages/shared/src/deck-builder/browse.ts';
import { colourIdentitySection } from '../../../packages/shared/src/deck-builder/colour-identity.ts';
import { FormalSwapEntrySchema } from '../../../packages/shared/src/schemas/deck-builder.ts';
import { documentFromArchidektSnapshot } from '../../../packages/web/src/deck-builder/import-export/import-deck.ts';

describe('colour identity mapping', () => {
  it('maps Archidekt colour names and letters', () => {
    expect(mapColourIdentityToken('Green')).toBe('G');
    expect(mapColourIdentityToken('blue')).toBe('U');
    expect(mapColourIdentityToken('W')).toBe('W');
    expect(normalizeColourIdentity(['Green', 'Blue', 'G'])).toEqual(['G', 'U']);
  });

  it('imports Archidekt Green as G', () => {
    const doc = documentFromArchidektSnapshot({
      deck_id: 1,
      name: 'CI Test',
      categories: [{ name: 'Creature', includedInDeck: true, includedInPrice: true }],
      cards: [
        {
          id: 1,
          name: 'Fog',
          quantity: 1,
          primary_category: 'Creature',
          categories: ['Creature'],
          color_identity: ['Green'],
        },
      ],
    });
    expect(doc.cards[0].colourIdentity).toEqual(['G']);
    expect(colourIdentitySection(doc.cards[0])).toBe('Green');
  });

  it('puts basic lands in their colour when CI is present or inferred', () => {
    expect(
      colourIdentitySection({
        name: 'Forest',
        typeLine: null,
        colourIdentity: ['G'],
      }),
    ).toBe('Green');
    expect(
      colourIdentitySection({
        name: 'Forest',
        typeLine: null,
        colourIdentity: [],
      }),
    ).toBe('Green');
  });
});

describe('partition omits swap categories', () => {
  it('hides Queued In/Out from browse partitions', () => {
    const deck = {
      categories: [
        { name: 'Creature', includedInDeck: true, includedInPrice: true },
        { name: 'Queued In', includedInDeck: true, includedInPrice: false },
        { name: 'Queued Out', includedInDeck: false, includedInPrice: false },
        { name: 'Maybeboard', includedInDeck: false, includedInPrice: true },
      ],
      cards: [
        {
          instanceId: '1',
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
          instanceId: '2',
          name: 'In Card',
          quantity: 1,
          primaryCategory: 'Queued In',
          categories: ['Queued In'],
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
          name: 'Out Card',
          quantity: 1,
          primaryCategory: 'Queued Out',
          categories: ['Queued Out'],
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
          instanceId: '4',
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
    expect(p.includedKeys).toEqual(['Creature']);
    expect(p.excludedKeys).toEqual(['Maybeboard']);
    expect(p.includedKeys).not.toContain('Queued In');
    expect(p.excludedKeys).not.toContain('Queued Out');
  });
});

describe('inTargetCategory', () => {
  it('parses formal swap entry with landing category', () => {
    const parsed = FormalSwapEntrySchema.parse({
      id: 's1',
      inInstanceId: 'a',
      outInstanceId: 'b',
      inTargetCategory: 'Creature',
      sortIndex: 0,
    });
    expect(parsed.inTargetCategory).toBe('Creature');
    const empty = FormalSwapEntrySchema.parse({
      id: 's2',
      sortIndex: 0,
    });
    expect(empty.inTargetCategory).toBeNull();
  });
});
