import { moveCardCategory, type CardInstance, type DeckDocument } from '@rayenz-hub/shared';

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

export type { CardInstance };
