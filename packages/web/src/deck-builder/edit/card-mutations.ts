import {
  addCardToDeck,
  changeCardPrinting,
  moveCardsCategory,
  removeCardFromDeck,
  setCardQuantity,
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

function nameKey(name: string | null | undefined): string {
  return String(name || '')
    .trim()
    .toLowerCase();
}

/**
 * Resolve a deck instance for picker actions: prefer matching scryfallId,
 * else the last same-name instance.
 */
export function findDeckInstanceForPickerCard(
  deck: Pick<DeckDocument, 'cards'>,
  opts: { name: string; scryfallId?: string | null },
): CardInstance | null {
  const key = nameKey(opts.name);
  if (!key) return null;
  const matches = (deck.cards || []).filter((c) => nameKey(c.name) === key);
  if (!matches.length) return null;
  const scryfallId = String(opts.scryfallId || '').trim();
  if (scryfallId) {
    const byId = matches.find((c) => String(c.scryfallId || '').trim() === scryfallId);
    if (byId) return byId;
  }
  return matches[matches.length - 1] ?? null;
}

/** Remove one copy of a named card (decrement stacked qty, else drop instance). */
export function removeOneCopyFromDeck(
  deck: DeckDocument,
  opts: { name: string; scryfallId?: string | null },
): DeckDocument {
  const inst = findDeckInstanceForPickerCard(deck, opts);
  if (!inst) return deck;
  const qty = Math.max(1, Number(inst.quantity) || 1);
  if (qty > 1) return setCardQuantity(deck, inst.instanceId, qty - 1);
  return removeCardFromDeck(deck, inst.instanceId);
}

export type { CardInstance, PrintingFields };
