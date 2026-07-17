import { describe, expect, it } from 'vitest';
import {
  commanderTypeCategory,
  defaultCategoryForCard,
  moveCardsToDefaultCategories,
  typeLineCardTypes,
} from '../../../packages/shared/src/index.ts';
import type { DeckDocument } from '../../../packages/shared/src/schemas/deck-builder.ts';

describe('commanderTypeCategory', () => {
  it('parses card types before the subtype dash', () => {
    expect(typeLineCardTypes('Legendary Creature — Elf Druid')).toBe('Legendary Creature');
    expect(typeLineCardTypes('Instant')).toBe('Instant');
    expect(typeLineCardTypes(null)).toBe('');
  });

  it('follows Land > Creature > … precedence', () => {
    expect(commanderTypeCategory('Land Creature — Forest Dryad')).toBe('Land');
    expect(commanderTypeCategory('Artifact Creature — Construct')).toBe('Creature');
    expect(commanderTypeCategory('Legendary Planeswalker — Jace')).toBe('Planeswalker');
    expect(commanderTypeCategory('Battle — Siege')).toBe('Battle');
    expect(commanderTypeCategory('Instant')).toBe('Instant');
    expect(commanderTypeCategory('Sorcery')).toBe('Sorcery');
    expect(commanderTypeCategory('Artifact')).toBe('Artifact');
    expect(commanderTypeCategory('Enchantment — Aura')).toBe('Enchantment');
    expect(commanderTypeCategory('Tribal Instant — Goblin')).toBe('Instant');
    expect(commanderTypeCategory('Kindred Sorcery — Eldrazi')).toBe('Sorcery');
    expect(commanderTypeCategory('Kindred')).toBe('Kindred');
    expect(commanderTypeCategory('')).toBe('Other');
    expect(commanderTypeCategory(null)).toBe('Other');
  });
});

describe('defaultCategoryForCard / moveCardsToDefaultCategories', () => {
  it('files cube cards by CI with Lands override', () => {
    const deck = { format: 'cube' as const, oracle: {} };
    expect(
      defaultCategoryForCard(deck, {
        name: 'Lightning Bolt',
        scryfallId: null,
        setCode: null,
        collectorNumber: null,
        colourIdentity: ['R'],
        typeLine: 'Instant',
      }),
    ).toBe('Red');
    expect(
      defaultCategoryForCard(deck, {
        name: 'Breeding Pool',
        scryfallId: null,
        setCode: null,
        collectorNumber: null,
        colourIdentity: ['G', 'U'],
        typeLine: 'Land — Forest Island',
      }),
    ).toBe('Lands');
  });

  it('files commander cards by type precedence', () => {
    const deck = { format: 'commander' as const, oracle: {} };
    expect(
      defaultCategoryForCard(deck, {
        name: 'Sol Ring',
        scryfallId: null,
        setCode: null,
        collectorNumber: null,
        typeLine: 'Artifact',
      }),
    ).toBe('Artifact');
    expect(
      defaultCategoryForCard(deck, {
        name: 'Dryad Arbor',
        scryfallId: null,
        setCode: null,
        collectorNumber: null,
        typeLine: 'Land Creature — Forest Dryad',
      }),
    ).toBe('Land');
  });

  it('moves selected cards to default categories and ensures defs', () => {
    const deck = {
      schemaVersion: 1,
      deckId: 'd1',
      name: 'Test',
      format: 'commander',
      archidektId: null,
      archidektUrl: null,
      categories: [{ name: 'Maybeboard', includedInDeck: false, includedInPrice: false, target: null }],
      cards: [
        {
          instanceId: 'a',
          name: 'Bolt',
          quantity: 1,
          primaryCategory: 'Maybeboard',
          categories: ['Maybeboard'],
          stack: null,
          setCode: null,
          collectorNumber: null,
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
        {
          instanceId: 'b',
          name: 'Forest',
          quantity: 1,
          primaryCategory: 'Maybeboard',
          categories: ['Maybeboard'],
          stack: null,
          setCode: null,
          collectorNumber: null,
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
      ],
      formalSwapEntries: [],
      oracle: {
        'name:bolt': {
          scryfallId: null,
          colourIdentity: ['R'],
          typeLine: 'Instant',
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: 1,
          imageUrl: null,
          finishes: null,
          updatedAt: null,
        },
        'name:forest': {
          scryfallId: null,
          colourIdentity: ['G'],
          typeLine: 'Basic Land — Forest',
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: 0,
          imageUrl: null,
          finishes: null,
          updatedAt: null,
        },
      },
      updatedAt: '2020-01-01T00:00:00.000Z',
      createdAt: '2020-01-01T00:00:00.000Z',
    } as DeckDocument;

    const next = moveCardsToDefaultCategories(deck, ['a', 'b']);
    const bolt = next.cards.find((c) => c.instanceId === 'a')!;
    const forest = next.cards.find((c) => c.instanceId === 'b')!;
    expect(bolt.primaryCategory).toBe('Instant');
    expect(forest.primaryCategory).toBe('Land');
    expect(next.categories.some((c) => c.name === 'Instant')).toBe(true);
    expect(next.categories.some((c) => c.name === 'Land')).toBe(true);
  });
});
