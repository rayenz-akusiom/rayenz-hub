import type { DeckDocument } from '../schemas/deck-builder.js';
import { cardImageUrl } from './scryfall-images.js';
import { pickCommanderPair } from './partner.js';
import { resolveDeckCards, type CardView } from './card-oracle.js';

type CoverDoc = Pick<DeckDocument, 'format' | 'cards' | 'coverInstanceId' | 'oracle'>;

function resolveCoverOverride(doc: CoverDoc): CardView | null {
  const id = doc.coverInstanceId;
  if (!id) return null;
  return resolveDeckCards(doc).find((c) => c.instanceId === id) ?? null;
}

/** Commander face for commander decks; first card for cubes (and other fallbacks). */
export function pickDeckCoverCard(doc: CoverDoc): CardView | null {
  const cards = pickDeckCoverCards(doc);
  return cards[0] ?? null;
}

/**
 * Up to two cover faces when a commander deck has exactly two Commander cards.
 * Lieutenants never appear as cover partners. Cubes / other: single first card.
 * When `coverInstanceId` is set and the instance exists, returns that card only.
 */
export function pickDeckCoverCards(doc: CoverDoc): CardView[] {
  const override = resolveCoverOverride(doc);
  if (override) return [override];

  const cards = resolveDeckCards(doc);
  if (doc.format === 'commander') {
    const pair = pickCommanderPair(cards);
    if (
      pair.status === 'legal' ||
      pair.status === 'illegal' ||
      pair.status === 'unknown'
    ) {
      return [pair.a as CardView, pair.b as CardView];
    }
    if (pair.status === 'single') return [pair.a as CardView];
    const commander = cards.find((c) => c.primaryCategory === 'Commander');
    if (commander) return [commander];
  }
  return cards[0] ? [cards[0]] : [];
}

export function deckCoverImageUrl(doc: CoverDoc): string | null {
  const card = pickDeckCoverCard(doc);
  if (!card) return null;
  return cardImageUrl(card) || null;
}

export function deckCoverImageUrlSecondary(doc: CoverDoc): string | null {
  const cards = pickDeckCoverCards(doc);
  if (cards.length < 2) return null;
  return cardImageUrl(cards[1]) || null;
}

export function pickCoverPartnerStatus(doc: CoverDoc): 'legal' | 'illegal' | null {
  if (resolveCoverOverride(doc)) return null;
  if (doc.format !== 'commander') return null;
  const pair = pickCommanderPair(resolveDeckCards(doc));
  if (pair.status === 'legal' || pair.status === 'illegal') return pair.status;
  return null;
}
