import { isSeekingCategory, isSwapInCategory } from '@rayenz-hub/shared';
import type { DeckRecord } from './types';

function cardPrimaryCategory(card: {
  primary_category?: string;
  categories?: string[];
}): string | undefined {
  return card.primary_category || (card.categories && card.categories[0]) || undefined;
}

export function suggestQueueBadge(
  deck: DeckRecord,
  name: string,
): 'seeking' | 'swap_in' | null {
  const needle = String(name || '').toLowerCase();
  let seeking = false;
  let swapIn = false;
  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((card) => {
    if (String(card.name || '').toLowerCase() !== needle) return;
    const primary = cardPrimaryCategory(card);
    const cats = [primary, ...(card.categories || [])];
    cats.forEach((c) => {
      if (isSeekingCategory(c)) seeking = true;
      if (isSwapInCategory(c)) swapIn = true;
    });
  });
  if (swapIn) return 'swap_in';
  if (seeking) return 'seeking';
  return null;
}

export type LeaderSnapshotCard = {
  name: string;
  set_code?: string;
  collector_number?: string;
  scryfall_id?: string;
  quantity?: number;
};

function cardsInCategory(
  deck: { deck_snapshot?: { cards?: Array<Record<string, unknown>> } },
  category: string,
): LeaderSnapshotCard[] {
  const out: LeaderSnapshotCard[] = [];
  const seen: Record<string, boolean> = {};
  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((card) => {
    const primary = cardPrimaryCategory(card as { primary_category?: string; categories?: string[] });
    const cats = [primary, ...((card.categories as string[] | undefined) || [])].filter(Boolean);
    if (!cats.includes(category) || !card.name) return;
    const key = String(card.name).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push({
      name: String(card.name),
      set_code: card.set_code != null ? String(card.set_code) : undefined,
      collector_number: card.collector_number != null ? String(card.collector_number) : undefined,
      scryfall_id: card.scryfall_id != null ? String(card.scryfall_id) : undefined,
      quantity: typeof card.quantity === 'number' ? card.quantity : undefined,
    });
  });
  return out;
}

export function commanderCardsFromDeck(
  deck: { deck_snapshot?: { cards?: Array<Record<string, unknown>> } },
): LeaderSnapshotCard[] {
  return cardsInCategory(deck, 'Commander');
}

export function lieutenantCardsFromDeck(
  deck: { deck_snapshot?: { cards?: Array<Record<string, unknown>> } },
): LeaderSnapshotCard[] {
  return cardsInCategory(deck, 'Lieutenants');
}

export function commanderNamesFromDeck(deck: DeckRecord): string[] {
  return commanderCardsFromDeck(deck).map((c) => c.name);
}

export function deckSuggestHeaderText(deck: DeckRecord): string {
  const deckName = String(deck.deck_name || deck.deck_id || 'Deck').trim() || 'Deck';
  const commanders = commanderNamesFromDeck(deck);
  if (!commanders.length) return deckName;
  return `${deckName} — ${commanders.join(' / ')}`;
}
