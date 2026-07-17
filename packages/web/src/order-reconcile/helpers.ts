import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import type { OrderReconcileDeck } from './types';

export function sortDecksByName(decks: OrderReconcileDeck[]): OrderReconcileDeck[] {
  return decks.slice().sort((a, b) => {
    const aCube = OrderReconcileExport.isCubeDeck(a) ? 0 : 1;
    const bCube = OrderReconcileExport.isCubeDeck(b) ? 0 : 1;
    if (aCube !== bCube) {
      return aCube - bCube;
    }
    return (a.deck_name || '').localeCompare(b.deck_name || '', undefined, { sensitivity: 'base' });
  });
}

export function getDeckById(
  deckId: string,
  decks: OrderReconcileDeck[],
  stagingDeck: OrderReconcileDeck | null,
  stagingDeckId: string,
): OrderReconcileDeck | null | undefined {
  if (deckId === stagingDeckId) {
    return stagingDeck;
  }
  return decks.find((d) => d.deck_id === deckId);
}

export function itemsForDeck(deckId: string, reconcileItems: { deck_id: string }[]): typeof reconcileItems {
  return reconcileItems.filter((item) => item.deck_id === deckId);
}
