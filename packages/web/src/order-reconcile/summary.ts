import { scryfallImageFromName, scryfallImageFromPrinting } from '@rayenz-hub/shared';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import type { CutOption, ItemDecision, OrderReconcileDeck, ReconcileItem } from './types';

export function summaryCardImageSrc(card: CutOption | null | undefined): string {
  if (!card) {
    return '';
  }
  if (card.set_code && card.collector_number) {
    return scryfallImageFromPrinting(card.set_code, card.collector_number) || '';
  }
  return scryfallImageFromName(card.name) || '';
}

export type SummaryCard = { name?: string; set_code?: string | null; collector_number?: string | null };

export type DeckSummary = {
  ins: SummaryCard[];
  outs: SummaryCard[];
  remainingIn: SummaryCard[];
  remainingOut: SummaryCard[];
};

export function summarizeDeck(
  deck: OrderReconcileDeck,
  items: ReconcileItem[],
  getDecisionFn: (itemId: string) => ItemDecision | null,
): DeckSummary {
  const accepted = items
    .map((item) => {
      const d = getDecisionFn(item.item_id);
      return d && d.status === 'accepted'
        ? { status: 'accepted' as const, accepted: d.accepted, slot_key: item.slot_key }
        : null;
    })
    .filter(Boolean);
  const isCube = OrderReconcileExport.isCubeDeck(deck);
  return OrderReconcileExport.summarizeDeck(deck.deck_id, deck.deck_snapshot, accepted, { isCube });
}

export function countAcceptedRemovals(
  reconcileItems: ReconcileItem[],
  getDecisionFn: (itemId: string) => ItemDecision | null,
): number {
  return reconcileItems.filter((item) => {
    const d = getDecisionFn(item.item_id);
    return d && d.status === 'accepted';
  }).length;
}
