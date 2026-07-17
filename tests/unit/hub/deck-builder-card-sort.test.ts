import { describe, expect, it } from 'vitest';
import {
  cardOracleFromScryfall,
  resolveCardView,
  sortCardsInGroup,
  type CardInstance,
  type CardView,
} from '@rayenz-hub/shared';

function lean(over: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'name'>): CardInstance {
  return {
    quantity: 1,
    primaryCategory: 'Other',
    categories: ['Other'],
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    ...over,
  };
}

function view(
  over: Partial<CardView> & Pick<CardInstance, 'instanceId' | 'name'>,
): CardView {
  return resolveCardView(lean(over), {
    scryfallId: over.scryfallId ?? null,
    colourIdentity: over.colourIdentity ?? [],
    typeLine: over.typeLine ?? 'Creature',
    layout: 'normal',
    keywords: null,
    partnerWith: null,
    oracleText: null,
    printedName: over.printedName ?? null,
    flavorName: over.flavorName ?? null,
    manaValue: over.manaValue ?? null,
    imageUrl: null,
    updatedAt: null,
  });
}

describe('cardOracleFromScryfall', () => {
  it('captures printed_name, flavor_name, and cmc', () => {
    const o = cardOracleFromScryfall({
      id: 'sf-arvinox',
      type_line: 'Legendary Enchantment Creature — Horror',
      color_identity: ['B'],
      layout: 'normal',
      printed_name: 'Mind Flayer, the Shadow',
      cmc: 7,
    });
    expect(o.printedName).toBe('Mind Flayer, the Shadow');
    expect(o.flavorName).toBeNull();
    expect(o.manaValue).toBe(7);
  });
});

describe('sortCardsInGroup', () => {
  const arvinox = view({
    instanceId: 'a',
    name: 'Arvinox, the Mind Flail',
    printedName: 'Mind Flayer, the Shadow',
    colourIdentity: ['B'],
    manaValue: 7,
  });
  const bolt = view({
    instanceId: 'b',
    name: 'Lightning Bolt',
    colourIdentity: ['R'],
    manaValue: 1,
  });
  const counterspell = view({
    instanceId: 'c',
    name: 'Counterspell',
    colourIdentity: ['U'],
    manaValue: 2,
  });
  const unknownMana = view({
    instanceId: 'd',
    name: 'Mystery Card',
    colourIdentity: ['G'],
    manaValue: null,
  });

  it('sorts A–Z by printed/display name (Mind Flayer under M, not A)', () => {
    const sorted = sortCardsInGroup([arvinox, bolt, counterspell], 'name_asc');
    expect(sorted.map((c) => c.instanceId)).toEqual(['c', 'b', 'a']);
  });

  it('sorts Z–A by display name', () => {
    const sorted = sortCardsInGroup([arvinox, bolt, counterspell], 'name_desc');
    expect(sorted.map((c) => c.instanceId)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by colour identity WUBRG section order', () => {
    const sorted = sortCardsInGroup([arvinox, bolt, counterspell], 'colour_identity');
    // Blue, Black, Red
    expect(sorted.map((c) => c.instanceId)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by mana value ascending with missing last', () => {
    const sorted = sortCardsInGroup([arvinox, unknownMana, bolt], 'mana_asc');
    expect(sorted.map((c) => c.instanceId)).toEqual(['b', 'a', 'd']);
  });

  it('sorts by mana value descending with missing last', () => {
    const sorted = sortCardsInGroup([arvinox, unknownMana, bolt], 'mana_desc');
    expect(sorted.map((c) => c.instanceId)).toEqual(['a', 'b', 'd']);
  });
});
