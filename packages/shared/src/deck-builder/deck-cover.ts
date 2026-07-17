import type { CardInstance, DeckDocument } from '../schemas/deck-builder.js';
import { cardImageUrl } from './scryfall-images.js';
import { pickCommanderPair } from './partner.js';

/** Commander face for commander decks; first card for cubes (and other fallbacks). */
export function pickDeckCoverCard(
  doc: Pick<DeckDocument, 'format' | 'cards'>,
): CardInstance | null {
  const cards = pickDeckCoverCards(doc);
  return cards[0] ?? null;
}

/**
 * Up to two cover faces when a commander deck has exactly two Commander cards.
 * Lieutenants never appear as cover partners. Cubes / other: single first card.
 */
export function pickDeckCoverCards(
  doc: Pick<DeckDocument, 'format' | 'cards'>,
): CardInstance[] {
  const cards = doc.cards || [];
  if (doc.format === 'commander') {
    const pair = pickCommanderPair(cards);
    if (
      pair.status === 'legal' ||
      pair.status === 'illegal' ||
      pair.status === 'unknown'
    ) {
      return [pair.a, pair.b];
    }
    if (pair.status === 'single') return [pair.a];
    const commander = cards.find((c) => c.primaryCategory === 'Commander');
    if (commander) return [commander];
  }
  return cards[0] ? [cards[0]] : [];
}

export function deckCoverImageUrl(doc: Pick<DeckDocument, 'format' | 'cards'>): string | null {
  const card = pickDeckCoverCard(doc);
  if (!card) return null;
  return cardImageUrl(card) || null;
}

export function deckCoverImageUrlSecondary(
  doc: Pick<DeckDocument, 'format' | 'cards'>,
): string | null {
  const cards = pickDeckCoverCards(doc);
  if (cards.length < 2) return null;
  return cardImageUrl(cards[1]) || null;
}

export function pickCoverPartnerStatus(
  doc: Pick<DeckDocument, 'format' | 'cards'>,
): 'legal' | 'illegal' | null {
  if (doc.format !== 'commander') return null;
  const pair = pickCommanderPair(doc.cards || []);
  if (pair.status === 'legal' || pair.status === 'illegal') return pair.status;
  return null;
}
