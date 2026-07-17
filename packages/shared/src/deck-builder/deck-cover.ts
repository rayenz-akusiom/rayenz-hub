import type { CardInstance, DeckDocument } from '../schemas/deck-builder.js';
import { cardImageUrl } from './scryfall-images.js';

/** Commander face for commander decks; first card for cubes (and other fallbacks). */
export function pickDeckCoverCard(
  doc: Pick<DeckDocument, 'format' | 'cards'>,
): CardInstance | null {
  const cards = doc.cards || [];
  if (doc.format === 'commander') {
    const commander = cards.find((c) => c.primaryCategory === 'Commander');
    if (commander) return commander;
  }
  return cards[0] ?? null;
}

export function deckCoverImageUrl(doc: Pick<DeckDocument, 'format' | 'cards'>): string | null {
  const card = pickDeckCoverCard(doc);
  if (!card) return null;
  return cardImageUrl(card) || null;
}
