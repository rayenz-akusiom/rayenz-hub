import type { CardInstance } from '../schemas/deck-builder.js';
import { isBasicLand } from './quantities.js';

export const COLOUR_IDENTITY_SECTIONS = [
  'White',
  'Blue',
  'Black',
  'Red',
  'Green',
  'Multicolor',
  'Colorless',
  'Lands',
] as const;

export type ColourIdentitySection = (typeof COLOUR_IDENTITY_SECTIONS)[number];

const MONO: Record<string, ColourIdentitySection> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

export function colourIdentitySection(
  card: Pick<CardInstance, 'name' | 'typeLine' | 'colourIdentity'>,
): ColourIdentitySection {
  if (/\bLand\b/i.test(card.typeLine || '') || isBasicLand(card)) {
    return 'Lands';
  }
  const colours = [...new Set((card.colourIdentity || []).filter(Boolean))];
  if (colours.length === 1) {
    return MONO[colours[0]] || 'Colorless';
  }
  if (colours.length >= 2) {
    return 'Multicolor';
  }
  return 'Colorless';
}

export function groupByColourIdentity(
  cards: CardInstance[],
): Record<ColourIdentitySection, CardInstance[]> {
  const groups = Object.fromEntries(
    COLOUR_IDENTITY_SECTIONS.map((s) => [s, [] as CardInstance[]]),
  ) as Record<ColourIdentitySection, CardInstance[]>;
  for (const card of cards) {
    groups[colourIdentitySection(card)].push(card);
  }
  return groups;
}
