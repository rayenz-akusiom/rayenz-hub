import { CutCandidates, SWAP_IN_LEGACY, SWAP_OUT_LEGACY } from '@rayenz-hub/shared';
import { optionKey, scryfallImageFromId, scryfallImageFromName, scryfallImageFromPrinting } from '../lib/hub-utils';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import type {
  CutOption,
  ItemDecision,
  OrderReconcileDeck,
  OrderReconcileState,
  PrintingParts,
  ReconcileItem,
} from './types';
import { STAGING_DECK_ID } from './types';

export function excludeCategories(): Record<string, boolean> {
  const excluded: Record<string, boolean> = {};
  excluded[CutCandidates.SWAP_IN] = true;
  excluded[CutCandidates.SWAP_OUT] = true;
  excluded[SWAP_IN_LEGACY] = true;
  excluded[SWAP_OUT_LEGACY] = true;
  Object.keys(CutCandidates.PROTECTED_CATEGORIES).forEach((key) => {
    excluded[key] = true;
  });
  excluded.Maybeboard = true;
  return excluded;
}

export function cubeMainCardSameName(deck: OrderReconcileDeck | null | undefined, name: string): CutOption | null {
  if (!deck?.deck_snapshot) {
    return null;
  }
  const excluded = excludeCategories();
  excluded[OrderReconcileExport.MAYBEBOARD_CATEGORY] = true;
  let found: CutOption | null = null;
  (deck.deck_snapshot.cards || []).forEach((card) => {
    if (found) {
      return;
    }
    const primary = card.primary_category || (card.categories && card.categories[0]);
    if (primary && excluded[primary]) {
      return;
    }
    if (OrderReconcileExport.namesMatch(name, card.name || '')) {
      found = {
        name: card.name || '',
        set_code: card.set_code || null,
        collector_number: card.collector_number || null,
      };
    }
  });
  return found;
}

export function defaultInImageSrc(item: ReconcileItem): string {
  if (item.is_cube && item.maybeboard_entry?.set_code && item.maybeboard_entry.collector_number) {
    return scryfallImageFromPrinting(item.maybeboard_entry.set_code, item.maybeboard_entry.collector_number);
  }
  if (item.acquired_set && item.acquired_collector) {
    return scryfallImageFromPrinting(item.acquired_set, item.acquired_collector);
  }
  return scryfallImageFromName(item.card_name);
}

export function defaultInPrinting(item: ReconcileItem): PrintingParts {
  if (item.is_cube && item.maybeboard_entry) {
    const mb = item.maybeboard_entry;
    if (mb.set_code && mb.collector_number) {
      return {
        name: mb.name || item.card_name,
        set_code: mb.set_code,
        collector_number: mb.collector_number,
        finish: 'nonfoil',
      };
    }
  }
  if (item.queued_in?.set_code && item.queued_in.collector_number) {
    return {
      name: item.queued_in.name || item.card_name,
      set_code: item.queued_in.set_code,
      collector_number: item.queued_in.collector_number,
      finish: 'nonfoil',
    };
  }
  if (item.acquired_set && item.acquired_collector) {
    return {
      name: item.card_name,
      set_code: item.acquired_set,
      collector_number: item.acquired_collector,
      finish: 'nonfoil',
    };
  }
  return {
    name: item.card_name,
    set_code: null,
    collector_number: null,
    finish: 'nonfoil',
  };
}

export function deckCutOptions(
  deck: OrderReconcileDeck,
  categoryFilter: string | null,
  includeOutQueue: boolean,
): CutOption[] {
  return CutCandidates.buildCutCandidates(deck.deck_snapshot, {
    excludeMaybeboard: true,
    categoryFilter: categoryFilter || null,
    includeOutQueue: !!includeOutQueue,
    outQueueCategory: OrderReconcileExport.OUT_CATEGORY,
  }) as CutOption[];
}

export function assignDefaultOuts(deck: OrderReconcileDeck, items: ReconcileItem[]): ReconcileItem[] {
  if (!deck || OrderReconcileExport.isCubeDeck(deck)) {
    return items.map((item) => ({ ...item, default_out: null }));
  }
  const queue = OrderReconcileExport.deriveSwapQueue(deck.deck_snapshot);
  const outQueue = queue.new_set_out || [];
  const usedKeys: Record<string, boolean> = {};
  let queueIdx = 0;

  function cutFromCard(card: { name: string; set_code?: string | null; collector_number?: string | null }): CutOption {
    return {
      name: card.name,
      set_code: card.set_code || null,
      collector_number: card.collector_number || null,
    };
  }

  function markUsed(cut: CutOption | null) {
    if (cut) {
      usedKeys[optionKey(cut)] = true;
    }
  }

  return items.map((item) => {
    if (item.paired_out?.name) {
      const defaultOut = cutFromCard(item.paired_out);
      markUsed(defaultOut);
      return { ...item, default_out: defaultOut };
    }
    while (queueIdx < outQueue.length) {
      const candidate = cutFromCard(outQueue[queueIdx]);
      queueIdx++;
      if (!usedKeys[optionKey(candidate)]) {
        markUsed(candidate);
        return { ...item, default_out: candidate };
      }
    }
    return { ...item, default_out: null };
  });
}

export function defaultCutForItem(item: ReconcileItem, deck: OrderReconcileDeck): CutOption | null {
  if (item.default_out) {
    return item.default_out;
  }
  if (item.paired_out) {
    return item.paired_out;
  }
  if (item.is_cube) {
    const sameNameCut = cubeMainCardSameName(deck, item.card_name);
    if (sameNameCut) {
      return sameNameCut;
    }
    return null;
  }
  return null;
}

export function cutOptionImageSrc(opt: CutOption | null | undefined): string {
  if (opt?.set_code && opt.collector_number) {
    return scryfallImageFromPrinting(opt.set_code, opt.collector_number);
  }
  return '';
}

export function cutValueFromOpt(opt: CutOption): string {
  return JSON.stringify({
    name: opt.name,
    set_code: opt.set_code || null,
    collector_number: opt.collector_number || null,
    quantity: 1,
  });
}

export function readCutValue(raw: string | null | undefined): CutOption | null {
  try {
    return raw ? (JSON.parse(raw) as CutOption) : null;
  } catch {
    return null;
  }
}

export function formatCardLabel(card: CutOption | PrintingParts | null | undefined): string {
  if (!card) {
    return '—';
  }
  let label: string;
  if (card.set_code && card.collector_number) {
    label = card.name + ' (' + String(card.set_code).toUpperCase() + ' #' + card.collector_number + ')';
  } else {
    label = card.name;
  }
  if ('finish' in card && card.finish === 'foil') {
    label += ' · Foil';
  }
  return label;
}

export function buildDeckImportText(
  deck: OrderReconcileDeck,
  items: ReconcileItem[],
  getDecisionFn: (itemId: string) => ItemDecision | null,
  isProxyOrder: boolean,
): string {
  const accepted = items
    .filter((item) => {
      const d = getDecisionFn(item.item_id);
      return d && d.status === 'accepted';
    })
    .map((item) => {
      const d = getDecisionFn(item.item_id)!;
      return {
        status: 'accepted' as const,
        accepted: d.status === 'accepted' ? d.accepted : undefined,
        slot_key: item.slot_key,
        is_cube: !!item.is_cube,
        maybeboard_entry: item.maybeboard_entry || null,
      };
    });
  return OrderReconcileExport.buildReconcileDeckImport(deck.deck_id, deck.deck_snapshot, accepted, items, {
    isProxyOrder,
  });
}

export function deckReconcileComplete(
  items: ReconcileItem[],
  getDecisionFn: (itemId: string) => ItemDecision | null,
): { complete: boolean; accepted: number; total: number } {
  return OrderReconcileExport.deckReconcileComplete(items, getDecisionFn);
}

export function printingImageSrc(printing: PrintingParts | null | undefined): string {
  if (printing?.scryfall_id) {
    return scryfallImageFromId(printing.scryfall_id);
  }
  if (printing?.set_code && printing?.collector_number) {
    return scryfallImageFromPrinting(printing.set_code, printing.collector_number);
  }
  if (printing?.name) {
    return scryfallImageFromName(printing.name);
  }
  return '';
}

export function getNextDeckId(state: OrderReconcileState): { phase: OrderReconcileState['phase']; activeDeckId: string } {
  const pending = state.decks.filter(
    (d) => state.reconcileItems.some((item) => item.deck_id === d.deck_id) && !state.completedDecks[d.deck_id],
  );
  if (pending.length) {
    return { phase: 'reconcile', activeDeckId: pending[0].deck_id };
  }
  return { phase: 'staging', activeDeckId: STAGING_DECK_ID };
}

export { scryfallImageFromId, scryfallImageFromName, scryfallImageFromPrinting };
