import type { DeckFormat } from '../schemas/deck-builder.js';
import type { BrowseView } from '../schemas/deck-builder.js';

export function isCubeDeck(input: {
  name?: string | null;
  format?: string | null;
  deckName?: string | null;
}): boolean {
  if (input.format === 'cube') return true;
  const name = String(input.name || input.deckName || '').toLowerCase();
  return /\bcube\b/.test(name);
}

export function detectDeckFormat(input: {
  name?: string | null;
  format?: string | null;
  deckName?: string | null;
}): DeckFormat {
  if (input.format === 'commander' || input.format === 'cube' || input.format === 'other') {
    return input.format;
  }
  if (isCubeDeck(input)) return 'cube';
  return 'commander';
}

export function defaultBrowseView(format: DeckFormat): BrowseView {
  return format === 'cube' ? 'colour_identity' : 'category';
}
