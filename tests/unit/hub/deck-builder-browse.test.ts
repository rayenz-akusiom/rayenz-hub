import { describe, it, expect } from 'vitest';
import {
  addSecondaryCategory,
  applyCategoryTargetWithSeed,
  categoryTargetsMismatchCubeSize,
  deckHeaderTarget,
  deckSizeMismatch,
  defaultAddCategory,
  defaultBrowseView,
  defaultCubeCategoryDefs,
  canonicalizeCategoryName,
  groupByAllCategories,
  groupByCategory,
  moveCardCategory,
  orderedCategoryKeys,
  deckSize,
  partitionCategories,
  removeSecondaryCategory,
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

describe('secondary categories and multi browse', () => {
  it('addSecondaryCategory keeps primary and appends tag', () => {
    const cards = [
      {
        ...commander.cards[0],
        instanceId: 'a',
        primaryCategory: 'Creature',
        categories: ['Creature'],
      },
    ];
    const next = addSecondaryCategory(cards, 'a', 'Ramp');
    expect(next[0].primaryCategory).toBe('Creature');
    expect(next[0].categories).toEqual(['Creature', 'Ramp']);
  });

  it('removeSecondaryCategory cannot strip primary', () => {
    const cards = [
      {
        ...commander.cards[0],
        instanceId: 'a',
        primaryCategory: 'Creature',
        categories: ['Creature', 'Ramp'],
      },
    ];
    expect(removeSecondaryCategory(cards, 'a', 'Creature')[0].categories).toEqual([
      'Creature',
      'Ramp',
    ]);
    expect(removeSecondaryCategory(cards, 'a', 'Ramp')[0].categories).toEqual(['Creature']);
  });

  it('moveCardCategory promotes a secondary to primary', () => {
    const cards = [
      {
        ...commander.cards[0],
        instanceId: 'a',
        primaryCategory: 'Creature',
        categories: ['Creature', 'Ramp'],
      },
    ];
    const next = moveCardCategory(cards, 'a', 'Ramp');
    expect(next[0].primaryCategory).toBe('Ramp');
    expect(next[0].categories).toEqual(['Ramp', 'Creature']);
  });

  it('groupByAllCategories duplicates into each membership', () => {
    const cards = [
      {
        ...commander.cards[0],
        instanceId: 'a',
        primaryCategory: 'Creature',
        categories: ['Creature', 'Ramp'],
      },
    ];
    const groups = groupByAllCategories(cards);
    expect(groups.Creature).toHaveLength(1);
    expect(groups.Creature[0].membership).toBe('primary');
    expect(groups.Ramp).toHaveLength(1);
    expect(groups.Ramp[0].membership).toBe('secondary');
  });

  it('cube category sort puts Colourless before Dual and customs last', () => {
    const part = partitionCategories(
      {
        ...cube,
        format: 'cube',
        categories: [
          { name: 'Maybeboard', includedInDeck: false, includedInPrice: false },
          { name: 'Azorius', includedInDeck: true, includedInPrice: true },
          { name: 'White', includedInDeck: true, includedInPrice: true },
          { name: 'Colorless', includedInDeck: true, includedInPrice: true },
          { name: 'Custom A', includedInDeck: true, includedInPrice: true },
        ],
        cards: [
          {
            ...cube.cards[0],
            instanceId: 'w',
            primaryCategory: 'White',
            categories: ['White'],
          },
          {
            ...cube.cards[0],
            instanceId: 'c',
            primaryCategory: 'Colorless',
            categories: ['Colorless'],
          },
          {
            ...cube.cards[0],
            instanceId: 'az',
            primaryCategory: 'Azorius',
            categories: ['Azorius'],
          },
          {
            ...cube.cards[0],
            instanceId: 'x',
            primaryCategory: 'Custom A',
            categories: ['Custom A'],
          },
        ],
      },
      { keySort: 'cube_ci' },
    );
    expect(part.includedKeys).toEqual(['White', 'Colourless', 'Azorius', 'Custom A']);
  });

  it('category_custom sort follows CategoryDef order', () => {
    const part = partitionCategories(
      {
        ...commander,
        categories: [
          { name: 'Land', includedInDeck: true, includedInPrice: true },
          { name: 'Creature', includedInDeck: true, includedInPrice: true },
        ],
      },
      { keySort: 'custom' },
    );
    expect(part.includedKeys[0]).toBe('Land');
    expect(part.includedKeys).toContain('Creature');
  });
});

describe('category targets', () => {
  it('seeds other targets when the first target is set', () => {
    const deck = {
      cards: [
        {
          ...cube.cards[0],
          instanceId: 'w1',
          primaryCategory: 'White',
          categories: ['White'],
        },
        {
          ...cube.cards[0],
          instanceId: 'w2',
          primaryCategory: 'White',
          categories: ['White'],
        },
        {
          ...cube.cards[0],
          instanceId: 'u1',
          primaryCategory: 'Blue',
          categories: ['Blue'],
        },
      ],
      categories: [
        { name: 'White', includedInDeck: true, includedInPrice: true, target: null },
        { name: 'Blue', includedInDeck: true, includedInPrice: true, target: null },
      ],
    };
    const next = applyCategoryTargetWithSeed(deck, 'White', 40);
    expect(next.find((c) => c.name === 'White')?.target).toBe(40);
    expect(next.find((c) => c.name === 'Blue')?.target).toBe(1);
  });

  it('header target prefers sum of category targets over cubeTargetSize', () => {
    const deck = {
      format: 'cube' as const,
      cubeTargetSize: 360,
      categories: [
        { name: 'White', includedInDeck: true, includedInPrice: true, target: 40 },
        { name: 'Blue', includedInDeck: true, includedInPrice: true, target: 40 },
      ],
    };
    expect(deckHeaderTarget(deck)).toBe(80);
    expect(categoryTargetsMismatchCubeSize(deck)).toBe(true);
  });

  it('commander size mismatch uses hidden 100 target', () => {
    expect(deckSizeMismatch(commander)).toBe(true);
    expect(deckHeaderTarget(commander)).toBeNull();
  });

  it('defaultAddCategory for cube uses colour identity section', () => {
    expect(
      defaultAddCategory(
        { format: 'cube', categories: [] },
        { name: 'Lightning Bolt', colourIdentity: ['R'], typeLine: 'Instant' },
      ),
    ).toBe('Red');
    expect(
      defaultAddCategory(
        { format: 'cube', categories: [] },
        { name: 'Plains', colourIdentity: ['W'], typeLine: 'Basic Land — Plains' },
      ),
    ).toBe('Lands');
  });

  it('defaultCubeCategoryDefs includes Maybeboard and Colourless before Dual', () => {
    const defs = defaultCubeCategoryDefs();
    expect(defs[0].name).toBe('Maybeboard');
    const names = defs.map((d) => d.name);
    expect(names.indexOf('Colourless')).toBeLessThan(names.indexOf('Azorius'));
    expect(names).toContain('Lands');
    expect(names).toContain('Prismatic');
  });

  it('canonicalizeCategoryName aliases Colorless to Colourless', () => {
    expect(canonicalizeCategoryName('Colorless')).toBe('Colourless');
    expect(canonicalizeCategoryName('colourless')).toBe('Colourless');
    expect(canonicalizeCategoryName('Colourless')).toBe('Colourless');
  });
});
