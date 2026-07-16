import {
  addCardToDeck,
  changeCardPrinting,
  moveCardCategory,
  removeCardFromDeck,
  type CardInstance,
  type DeckDocument,
  type PrintingFields,
} from '@rayenz-hub/shared';

/** Pointer-friendly helper used by tests / future DnD wiring. */
export function applyCardMove(
  deck: DeckDocument,
  instanceId: string,
  primaryCategory: string,
  stack: string | null = null,
): DeckDocument {
  return {
    ...deck,
    cards: moveCardCategory(deck.cards, instanceId, primaryCategory, stack),
    updatedAt: new Date().toISOString(),
  };
}

export function applyAddCard(
  deck: DeckDocument,
  printing: PrintingFields,
  category: string,
): DeckDocument {
  return addCardToDeck(deck, printing, category);
}

export function applyRemoveCard(deck: DeckDocument, instanceId: string): DeckDocument {
  return removeCardFromDeck(deck, instanceId);
}

export function applyChangePrinting(
  deck: DeckDocument,
  instanceId: string,
  printing: PrintingFields,
): DeckDocument {
  return changeCardPrinting(deck, instanceId, printing);
}

export type { CardInstance, PrintingFields };
