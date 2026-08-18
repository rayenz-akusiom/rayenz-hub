import {
  SEEKING,
  SWAP_IN,
  applyDeckPatch,
  defaultSwapInTargetCategory,
  finalizeFormalSwap,
  type DeckDocument,
  type DeckPatch,
} from '@rayenz-hub/shared';
import { getDeck } from '../deck-builder/store/deck-store';
import { apiGetDeck } from '../deck-builder/store/deck-api';
import { saveDualMode } from '../deck-builder/store/deck-dual-mode';
import { removeLookingForEntry } from '../deck-builder/swaps/useSwapQueue';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import type { ItemDecision, ReconcileItem } from './types';

function mintId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function namesMatch(a: string, b: string): boolean {
  return OrderReconcileExport.namesMatch(a, b);
}

function printingPatch(cardIn: {
  name: string;
  set_code?: string | null;
  collector_number?: string | null;
  finish?: string;
  scryfall_id?: string;
}, proxy: boolean) {
  return {
    name: cardIn.name,
    setCode: cardIn.set_code || null,
    collectorNumber: cardIn.collector_number || null,
    scryfallId: cardIn.scryfall_id || null,
    foil: cardIn.finish === 'foil',
    proxy,
  };
}

function findCardByName(deck: DeckDocument, name: string) {
  return (deck.cards || []).find((c) => namesMatch(c.name, name));
}

function findSwapForInName(deck: DeckDocument, name: string) {
  for (const entry of deck.formalSwapEntries || []) {
    if (!entry.inInstanceId) continue;
    const inCard = deck.cards.find((c) => c.instanceId === entry.inInstanceId);
    if (inCard && namesMatch(inCard.name, name)) return entry;
  }
  return null;
}

function findSeekingForName(deck: DeckDocument, name: string) {
  for (const entry of deck.lookingForEntries || []) {
    const card = deck.cards.find((c) => c.instanceId === entry.instanceId);
    if (card && namesMatch(card.name, name)) return { entry, card };
  }
  return null;
}

function resolveOutInstanceId(
  deck: DeckDocument,
  out: { name: string; set_code?: string | null; collector_number?: string | null },
): string | null {
  const name = String(out.name || '').trim().toLowerCase();
  if (!name) return null;
  const candidates = (deck.cards || []).filter((c) => c.name.toLowerCase() === name);
  if (!candidates.length) return null;
  const setCode = String(out.set_code || '').trim().toLowerCase();
  const collector = String(out.collector_number || '').trim();
  if (setCode && collector) {
    const exact = candidates.find(
      (c) =>
        String(c.setCode || '').toLowerCase() === setCode && String(c.collectorNumber || '') === collector,
    );
    if (exact) return exact.instanceId;
  }
  return candidates[0].instanceId;
}

function targetCategory(deck: DeckDocument, requested: string | null | undefined): string {
  const n = String(requested || '').trim();
  if (n && n !== SEEKING && n !== SWAP_IN) return n;
  return defaultSwapInTargetCategory(deck);
}

function applyPatch(deck: DeckDocument, patch: DeckPatch): DeckDocument {
  return applyDeckPatch(deck, { ...patch, expectedUpdatedAt: deck.updatedAt });
}

function applyAcceptedItem(
  deck: DeckDocument,
  item: ReconcileItem,
  decision: Extract<ItemDecision, { status: 'accepted' }>,
  isProxyOrder: boolean,
): DeckDocument {
  const cardIn = decision.accepted.card_in;
  const cardOut = decision.accepted.card_out;
  const dest = targetCategory(deck, decision.accepted.destination_category || item.destination_category);
  const fields = printingPatch(cardIn, isProxyOrder);

  if (item.is_cube || item.maybeboard_entry) {
    const existing = findCardByName(deck, item.card_name);
    if (existing) {
      return applyPatch(deck, {
        cardOps: [{ op: 'update', instanceId: existing.instanceId, patch: { ...fields, primaryCategory: dest } }],
      });
    }
    return applyPatch(deck, {
      cardOps: [
        {
          op: 'add',
          card: {
            instanceId: mintId('c'),
            name: cardIn.name,
            primaryCategory: dest,
            categories: isProxyOrder ? [dest, 'Proxies'] : [dest],
            ...fields,
            quantity: 1,
          },
        },
      ],
    });
  }

  const existingSwap = findSwapForInName(deck, item.card_name);
  if (existingSwap?.inInstanceId && existingSwap.outInstanceId) {
    let next = applyPatch(deck, {
      cardOps: [{ op: 'update', instanceId: existingSwap.inInstanceId, patch: fields }],
    });
    return finalizeFormalSwap(next, existingSwap.id) ?? next;
  }

  const seeking = findSeekingForName(deck, item.card_name);
  if (seeking) {
    if (cardOut?.name) {
      const outId = resolveOutInstanceId(deck, cardOut);
      if (!outId) {
        throw new Error('Could not find Out card "' + cardOut.name + '" on Hub deck.');
      }
      let next = applyPatch(deck, {
        cardOps: [{ op: 'update', instanceId: seeking.card.instanceId, patch: fields }],
        formalSwapOps: [
          {
            op: 'add',
            entry: {
              inInstanceId: seeking.card.instanceId,
              outInstanceId: outId,
              inTargetCategory: dest,
              sortIndex: (deck.formalSwapEntries || []).length,
            },
          },
        ],
        lookingForOps: [{ op: 'remove', id: seeking.entry.id }],
      });
      const added = (next.formalSwapEntries || []).find(
        (e) => e.inInstanceId === seeking.card.instanceId && e.outInstanceId === outId,
      );
      if (added) {
        next = finalizeFormalSwap(next, added.id) ?? next;
      }
      return next;
    }
    const next = applyPatch(deck, {
      cardOps: [{ op: 'update', instanceId: seeking.card.instanceId, patch: { ...fields, primaryCategory: dest } }],
    });
    return removeLookingForEntry(next, seeking.entry.id);
  }

  if (cardOut?.name) {
    const outId = resolveOutInstanceId(deck, cardOut);
    if (!outId) {
      throw new Error('Could not find Out card "' + cardOut.name + '" on Hub deck.');
    }
    const inId = mintId('c');
    const lookingForToClear = (deck.lookingForEntries || []).filter((e) => {
      const card = deck.cards.find((c) => c.instanceId === e.instanceId);
      return card && namesMatch(card.name, item.card_name);
    });
    let next = applyPatch(deck, {
      cardOps: [
        {
          op: 'add',
          card: {
            instanceId: inId,
            name: cardIn.name,
            primaryCategory: SWAP_IN,
            categories: [SWAP_IN],
            ...fields,
            quantity: 1,
          },
        },
      ],
      formalSwapOps: [
        {
          op: 'add',
          entry: {
            inInstanceId: inId,
            outInstanceId: outId,
            inTargetCategory: dest,
            sortIndex: (deck.formalSwapEntries || []).length,
          },
        },
      ],
      lookingForOps: lookingForToClear.map((e) => ({ op: 'remove' as const, id: e.id })),
    });
    const added = (next.formalSwapEntries || []).find((e) => e.inInstanceId === inId);
    if (added) {
      next = finalizeFormalSwap(next, added.id) ?? next;
    }
    return next;
  }

  const existing = findCardByName(deck, item.card_name);
  const inId = existing?.instanceId || mintId('c');
  return applyPatch(deck, {
    lookingForOps: [
      {
        op: 'add',
        entry: {
          instanceId: inId,
          sortIndex: (deck.lookingForEntries || []).length,
        },
      },
    ],
    cardOps: existing
      ? [{ op: 'update', instanceId: inId, patch: fields }]
      : [
          {
            op: 'add',
            card: {
              instanceId: inId,
              name: cardIn.name,
              primaryCategory: SEEKING,
              categories: [SEEKING],
              ...fields,
              quantity: 1,
            },
          },
        ],
  });
}

/** Persist accepted reconcile decisions onto the Hub deck (SoR). */
export async function persistReconcileDeckToHub(
  deckId: string,
  items: ReconcileItem[],
  getDecision: (itemId: string) => ItemDecision | null,
  isProxyOrder: boolean,
): Promise<DeckDocument> {
  const local = (await getDeck(deckId)) || (await apiGetDeck(deckId));
  if (!local) {
    throw new Error('Save this deck to Hub before reconciling.');
  }
  let next = local;
  for (const item of items) {
    const decision = getDecision(item.item_id);
    if (!decision || decision.status !== 'accepted') continue;
    next = applyAcceptedItem(next, item, decision, isProxyOrder);
  }
  const { saved, apiError } = await saveDualMode(next);
  if (apiError) {
    throw new Error(apiError);
  }
  return saved;
}
