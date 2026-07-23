import {
  addCardToDeck,
  changeCardPrinting,
  moveCardsCategory,
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
  return moveCardsCategory(deck, [instanceId], primaryCategory, stack);
}

export function applyAddCard(
  deck: DeckDocument,
  printing: PrintingFields,
  category: string,
  opts?: { proxy?: boolean },
): DeckDocument {
  return addCardToDeck(deck, printing, category, opts);
}

export function applyRemoveCard(deck: DeckDocument, instanceId: string): DeckDocument {
  return removeCardFromDeck(deck, instanceId);
}

export function applyChangePrinting(
  deck: DeckDocument,
  instanceId: string,
  printing: PrintingFields,
  opts?: { proxy?: boolean },
): DeckDocument {
  return changeCardPrinting(deck, instanceId, printing, opts);
}

export type { CardInstance, PrintingFields };
