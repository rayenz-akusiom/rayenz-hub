import {
  getOracle,
  isBasicLand,
  type CardInstance,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { OrderEmailParse } from '../mtg/email-parse';
import type { AcquiredCard } from './types';

function categoryLooksLikeLand(card: CardInstance): boolean {
  const cats = [card.primaryCategory, ...(card.categories || [])];
  return cats.some((c) => /^lands?$/i.test(String(c || '').trim()));
}

function isLandCard(card: CardInstance, typeLine: string | null | undefined): boolean {
  if (typeLine && /Land/i.test(typeLine)) return true;
  if (!typeLine) return categoryLooksLikeLand(card);
  return false;
}

/** Non-basic lands from a precon (or any) deck document as acquired-card rows. */
export function nonBasicLandsFromPreconDeck(doc: DeckDocument): AcquiredCard[] {
  const out: AcquiredCard[] = [];
  for (const card of doc.cards || []) {
    const typeLine = getOracle(doc, card)?.typeLine ?? null;
    if (!isLandCard(card, typeLine)) continue;
    if (isBasicLand({ name: card.name, typeLine })) continue;
    out.push({
      name: card.name,
      quantity: Math.max(1, Number(card.quantity) || 1),
      set_code: card.setCode || null,
      collector_number: card.collectorNumber || null,
      finish: card.foil ? 'foil' : null,
    });
  }
  return out;
}

/** Merge existing acquired cards with non-basic lands from one or more precon decks. */
export function mergeAcquiredWithPreconLands(
  existing: AcquiredCard[],
  docs: DeckDocument[],
): AcquiredCard[] {
  const fromDecks = docs.flatMap((doc) => nonBasicLandsFromPreconDeck(doc));
  return OrderEmailParse.mergeAcquiredCards([...existing, ...fromDecks]).map((c, i) => ({
    ...c,
    name: c.name || '',
    id: c.id || 'acq-' + i,
  }));
}
