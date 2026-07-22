import type { DeckDocument, FormalSwapEntry, LookingForEntry, PrintingFields } from '@rayenz-hub/shared';
import {
  SEEKING,
  addCardToDeck,
  syncCardsWithFormalSwaps,
  syncCardsWithLookingFor,
} from '@rayenz-hub/shared';

/** Hook-shaped helper for swap queue updates (used by panel / future extraction). */
export function updateSwapEntries(deck: DeckDocument, entries: FormalSwapEntry[]): DeckDocument {
  return syncCardsWithFormalSwaps(deck, entries);
}

function newLookingForId(): string {
  return `lf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Create a card instance for `printing`, append a Seeking entry, and sync categories. */
export function addLookingForCard(
  deck: DeckDocument,
  printing: PrintingFields,
  meta?: { proxy: boolean },
): DeckDocument {
  const before = new Set(deck.cards.map((c) => c.instanceId));
  const withCard = addCardToDeck(deck, printing, SEEKING, { proxy: meta?.proxy });
  const added = withCard.cards.find((c) => !before.has(c.instanceId));
  if (!added) return withCard;
  const entries: LookingForEntry[] = [
    ...(withCard.lookingForEntries || []),
    {
      id: newLookingForId(),
      instanceId: added.instanceId,
      sortIndex: (withCard.lookingForEntries || []).length,
      notes: null,
    },
  ];
  return syncCardsWithLookingFor(withCard, entries).deck;
}

/** Remove a Seeking entry by id and re-sync category membership. */
export function removeLookingForEntry(deck: DeckDocument, entryId: string): DeckDocument {
  const entries = (deck.lookingForEntries || []).filter((e) => e.id !== entryId);
  return syncCardsWithLookingFor(deck, entries).deck;
}
