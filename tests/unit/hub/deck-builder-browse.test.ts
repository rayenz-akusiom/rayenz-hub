import { describe, it, expect } from 'vitest';
import {
  defaultBrowseView,
  groupByCategory,
  orderedCategoryKeys,
  deckSize,
  partitionCategories,
} from '../../../packages/shared/src/index.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';
import cube from '../../fixtures/deck-builder/cube-slice.json';
import { colourIdentitySection } from '../../../packages/shared/src/deck-builder/colour-identity.ts';

describe('browse grouping', () => {
  it('groups by primary category', () => {
    const groups = groupByCategory(commander.cards);
    expect(groups.Creature).toHaveLength(1);
    expect(groups.Land).toHaveLength(1);
  });

  it('orders Commander and Lieutenants as headers', () => {
    const groups = groupByCategory([
      ...commander.cards,
      {
        ...commander.cards[0],
        instanceId: 'cmd',
        name: 'Atraxa',
        primaryCategory: 'Commander',
        categories: ['Commander'],
      },
      {
        ...commander.cards[0],
        instanceId: 'lt',
        name: 'Partner',
        primaryCategory: 'Lieutenants',
        categories: ['Lieutenants'],
      },
    ]);
    const ordered = orderedCategoryKeys(groups);
    expect(ordered.header).toEqual(['Commander', 'Lieutenants']);
    expect(ordered.rest).not.toContain('Commander');
  });

  it('deckSize uses includedInDeck quantities', () => {
    expect(deckSize(commander)).toBe(3);
    const withMaybe = {
      ...commander,
      categories: [
        ...commander.categories,
        { name: 'Maybeboard', includedInDeck: false, includedInPrice: true },
      ],
      cards: [
        ...commander.cards,
        {
          ...commander.cards[0],
          instanceId: 'mb1',
          primaryCategory: 'Maybeboard',
          categories: ['Maybeboard'],
          quantity: 5,
        },
      ],
    };
    expect(deckSize(withMaybe)).toBe(3);
  });

  it('defaults browse view by format', () => {
    expect(defaultBrowseView('commander')).toBe('category');
    expect(defaultBrowseView('cube')).toBe('colour_identity');
  });

  it('CI sections for cube lands', () => {
    const land = cube.cards.find((c) => c.instanceId === 'u2');
    expect(colourIdentitySection(land)).toBe('Azorius');
  });

  it('omits Queued In/Out from partition by default', () => {
    const withSwaps = {
      ...commander,
      categories: [
        ...commander.categories,
        { name: 'Queued In', includedInDeck: false, includedInPrice: true },
        { name: 'Queued Out', includedInDeck: false, includedInPrice: true },
      ],
      cards: [
        ...commander.cards,
        {
          ...commander.cards[0],
          instanceId: 'in1',
          primaryCategory: 'Queued In',
          categories: ['Queued In'],
        },
        {
          ...commander.cards[0],
          instanceId: 'out1',
          primaryCategory: 'Queued Out',
          categories: ['Queued Out'],
        },
      ],
    };
    const part = partitionCategories(withSwaps);
    expect(part.excludedKeys).not.toContain('Queued In');
    expect(part.excludedKeys).not.toContain('Queued Out');
    expect(part.includedKeys).not.toContain('Queued In');
  });

  it('surfaces Queued In/Out in aside when includeSwapCategories', () => {
    const withSwaps = {
      ...commander,
      categories: [
        ...commander.categories,
        { name: 'Queued In', includedInDeck: false, includedInPrice: true },
        { name: 'Queued Out', includedInDeck: false, includedInPrice: true },
      ],
      cards: [
        ...commander.cards,
        {
          ...commander.cards[0],
          instanceId: 'in1',
          primaryCategory: 'Queued In',
          categories: ['Queued In'],
        },
        {
          ...commander.cards[0],
          instanceId: 'out1',
          primaryCategory: 'Queued Out',
          categories: ['Queued Out'],
        },
      ],
    };
    const part = partitionCategories(withSwaps, { includeSwapCategories: true });
    expect(part.excludedKeys).toEqual(expect.arrayContaining(['Queued In', 'Queued Out']));
    expect(part.excluded['Queued In']).toHaveLength(1);
    expect(part.excluded['Queued Out']).toHaveLength(1);
  });
});
