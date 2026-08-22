import type { DeckFormat } from '../schemas/deck-builder.js';
import type { BrowseView } from '../schemas/deck-builder.js';

export type BuilderFormat = 'commander' | 'cube';

/** Commander and Pendragon: 100-card singleton, command-zone leaders, commander builder. */
export function isCommandZoneFormat(format: string | null | undefined): boolean {
  return format === 'commander' || format === 'pendragon';
}

export function builderFormatForDeck(format: string | null | undefined): BuilderFormat {
  return format === 'cube' ? 'cube' : 'commander';
}

export function deckBelongsToBuilder(
  deckFormat: string | null | undefined,
  builderFormat: BuilderFormat,
): boolean {
  if (builderFormat === 'cube') return deckFormat === 'cube';
  return deckFormat === 'commander' || deckFormat === 'pendragon';
}

export function isCubeDeck(input: {
  name?: string | null;
  format?: string | null;
  deckName?: string | null;
}): boolean {
  if (input.format === 'cube') return true;
  const name = String(input.name || input.deckName || '').toLowerCase();
  return /\bcube\b/.test(name);
}

export function isPendragonDeck(input: {
  name?: string | null;
  format?: string | null;
  deckName?: string | null;
}): boolean {
  if (input.format === 'pendragon') return true;
  const name = String(input.name || input.deckName || '').toLowerCase();
  return /\bpendragon\b/.test(name);
}

export function detectDeckFormat(input: {
  name?: string | null;
  format?: string | null;
  deckName?: string | null;
}): DeckFormat {
  if (
    input.format === 'commander' ||
    input.format === 'cube' ||
    input.format === 'pendragon' ||
    input.format === 'other'
  ) {
    return input.format;
  }
  if (isCubeDeck(input)) return 'cube';
  if (isPendragonDeck(input)) return 'pendragon';
  return 'commander';
}

export function defaultBrowseView(format: DeckFormat): BrowseView {
  return format === 'cube' ? 'colour_identity' : 'category';
}
