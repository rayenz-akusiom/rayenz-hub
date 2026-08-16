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

export function commanderNamesFromDeck(deck: DeckRecord): string[] {
  const names: string[] = [];
  const seen: Record<string, boolean> = {};
  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((card) => {
    const primary = cardPrimaryCategory(card);
    if (primary !== 'Commander' || !card.name) return;
    const key = card.name.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    names.push(card.name);
  });
  return names;
}

export function deckSuggestHeaderText(deck: DeckRecord): string {
  const deckName = String(deck.deck_name || deck.deck_id || 'Deck').trim() || 'Deck';
  const commanders = commanderNamesFromDeck(deck);
  if (!commanders.length) return deckName;
  return `${deckName} — ${commanders.join(' / ')}`;
}
