import { scryfallImageFromName, scryfallImageFromPrinting } from '../lib/hub-utils';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import { fetchColorIdentity } from './data';
import { getDeckById } from './helpers';
import type {
  AcquiredCard,
  Assignment,
  AssignmentCandidate,
  AssignmentIndex,
  CardCopy,
  NeedsReviewItem,
  OrderReconcileDeck,
  OrderReconcileState,
  ReconcileItem,
} from './types';
import { STAGING_DECK_ID } from './types';

export function expandToCopies(acquiredCards: AcquiredCard[]): CardCopy[] {
  const copies: CardCopy[] = [];
  (acquiredCards || []).forEach((acq) => {
    const qty = acq.quantity || 1;
    for (let i = 0; i < qty; i++) {
      copies.push({
        copy_id: (acq.id || 'acq') + ':' + i,
        acquired_id: acq.id || 'acq',
        card_name: acq.name,
        set_code: acq.set_code || null,
        collector_number: acq.collector_number || null,
        finish: acq.finish || null,
      });
    }
  });
  return copies;
}

function indexKeysForName(name: string): string[] {
  const keys: Record<string, boolean> = {};
  keys[String(name || '').trim().toLowerCase()] = true;
  OrderReconcileExport.cardFaces(name).forEach((face) => {
    keys[face] = true;
  });
  return Object.keys(keys);
}

function addCandidateToIndex(index: Record<string, AssignmentCandidate[]>, name: string, candidate: AssignmentCandidate): void {
  indexKeysForName(name).forEach((key) => {
    if (!index[key]) {
      index[key] = [];
    }
    index[key].push(candidate);
  });
}

function lookupAssignmentIndex(index: Record<string, AssignmentCandidate[]>, cardName: string): AssignmentCandidate[] {
  const seen: Record<string, boolean> = {};
  const result: AssignmentCandidate[] = [];
  function collect(key: string) {
    (index[key] || []).forEach((candidate) => {
      if (seen[candidate.slot_key]) {
        return;
      }
      seen[candidate.slot_key] = true;
      result.push(candidate);
    });
  }
  collect(String(cardName || '').trim().toLowerCase());
  OrderReconcileExport.cardFaces(cardName).forEach(collect);
  return result;
}

export function buildAssignmentIndex(decks: OrderReconcileDeck[]): AssignmentIndex {
  const swapByName: Record<string, AssignmentCandidate[]> = {};
  const maybeboardByName: Record<string, AssignmentCandidate[]> = {};

  (decks || []).forEach((deck) => {
    if (OrderReconcileExport.isCubeDeck(deck)) {
      OrderReconcileExport.deriveMaybeboard(deck.deck_snapshot).forEach((entry, idx) => {
        const destCat = OrderReconcileExport.resolveCubeDestinationCategory(deck.deck_snapshot, entry.color_identity);
        addCandidateToIndex(swapByName, entry.name, {
          deck_id: deck.deck_id,
          deck_name: deck.deck_name,
          slot_key: OrderReconcileExport.maybeboardSlotKey(deck.deck_id, idx, entry.name),
          queued_in: entry,
          paired_out: null,
          destination_category: destCat,
          is_cube: true,
          maybeboard_entry: {
            name: entry.name,
            set_code: entry.set_code,
            collector_number: entry.collector_number,
            quantity: 1,
          },
        });
      });
      return;
    }

    const queue = OrderReconcileExport.deriveSwapQueue(deck.deck_snapshot);
    OrderReconcileExport.pairSwapSlots(queue.new_set_in, queue.new_set_out).forEach((pair) => {
      addCandidateToIndex(swapByName, pair.in.name, {
        deck_id: deck.deck_id,
        deck_name: deck.deck_name,
        slot_key: OrderReconcileExport.fulfilledSlotKey(deck.deck_id, pair.index, pair.in.name),
        queued_in: pair.in,
        paired_out: pair.out,
        is_cube: false,
        maybeboard_entry: null,
      });
    });

    OrderReconcileExport.deriveMaybeboard(deck.deck_snapshot).forEach((entry, idx) => {
      addCandidateToIndex(maybeboardByName, entry.name, {
        deck_id: deck.deck_id,
        deck_name: deck.deck_name,
        slot_key: OrderReconcileExport.maybeboardSlotKey(deck.deck_id, idx, entry.name),
        queued_in: entry,
        paired_out: null,
        destination_category: '',
        is_cube: false,
        is_maybeboard: true,
        maybeboard_entry: {
          name: entry.name,
          set_code: entry.set_code,
          collector_number: entry.collector_number,
          quantity: 1,
        },
      });
    });
  });

  return { swapByName, maybeboardByName };
}

function ensureAssignmentIndex(state: Pick<OrderReconcileState, 'decks' | 'assignmentIndex'>): AssignmentIndex {
  if (!state.assignmentIndex) {
    return buildAssignmentIndex(state.decks);
  }
  return state.assignmentIndex;
}

export function findCandidatesForName(
  state: Pick<OrderReconcileState, 'decks' | 'assignmentIndex'>,
  cardName: string,
): AssignmentCandidate[] {
  const index = ensureAssignmentIndex(state);
  return lookupAssignmentIndex(index.swapByName, cardName);
}

export function findMaybeboardCandidatesForName(
  state: Pick<OrderReconcileState, 'decks' | 'assignmentIndex'>,
  cardName: string,
): AssignmentCandidate[] {
  const index = ensureAssignmentIndex(state);
  return lookupAssignmentIndex(index.maybeboardByName, cardName);
}

async function resolveCubeCandidateCategories(
  state: OrderReconcileState,
  candidates: AssignmentCandidate[],
): Promise<{ candidates: AssignmentCandidate[]; colorIdentityCache: Record<string, string[]> }> {
  let cache = state.colorIdentityCache;
  const resolved = [...candidates];
  for (let i = 0; i < resolved.length; i++) {
    const c = resolved[i];
    if (!c.is_cube || c.destination_category) {
      continue;
    }
    const deck = getDeckById(c.deck_id, state.decks, state.stagingDeck, STAGING_DECK_ID);
    if (!deck?.deck_snapshot) {
      continue;
    }
    const { ci, cache: nextCache } = await fetchColorIdentity(c.queued_in?.name || '', cache);
    cache = nextCache;
    resolved[i] = {
      ...c,
      destination_category: OrderReconcileExport.resolveCubeDestinationCategory(deck.deck_snapshot, ci),
    };
  }
  return { candidates: resolved, colorIdentityCache: cache };
}

function makeAssignment(copy: CardCopy, candidate: AssignmentCandidate, reason: string): Assignment {
  return {
    copy_id: copy.copy_id,
    card_name: copy.card_name,
    deck_id: candidate.deck_id,
    deck_name: candidate.deck_name,
    slot_key: candidate.slot_key,
    queued_in: candidate.queued_in,
    paired_out: candidate.paired_out,
    destination_category: candidate.destination_category || '',
    is_cube: !!candidate.is_cube,
    maybeboard_entry: candidate.maybeboard_entry || null,
    reason: reason || 'auto',
  };
}

export async function buildAssignmentPlan(
  state: OrderReconcileState,
): Promise<
  Pick<
    OrderReconcileState,
    'assignmentIndex' | 'copies' | 'assignments' | 'needsReview' | 'colorIdentityCache'
  >
> {
  const assignmentIndex = buildAssignmentIndex(state.decks);
  const copies = expandToCopies(state.acquiredCards);
  const assignments: Assignment[] = [];
  const needsReview: NeedsReviewItem[] = [];
  const usedSlots: Record<string, boolean> = {};
  let colorIdentityCache = state.colorIdentityCache;

  const byName: Record<string, CardCopy[]> = {};
  copies.forEach((copy) => {
    const key = copy.card_name.toLowerCase();
    if (!byName[key]) {
      byName[key] = [];
    }
    byName[key].push(copy);
  });

  function freeCandidates(candidates: AssignmentCandidate[]): AssignmentCandidate[] {
    return candidates.filter((c) => !usedSlots[c.slot_key]);
  }

  const ctx = { ...state, assignmentIndex };
  const nameKeys = Object.keys(byName);
  for (const nameKey of nameKeys) {
    const copyList = byName[nameKey];
    const resolved = await resolveCubeCandidateCategories(ctx, findCandidatesForName(ctx, copyList[0].card_name));
    colorIdentityCache = resolved.colorIdentityCache;
    const candidates = resolved.candidates;
    const n = copyList.length;
    const s = candidates.length;

    if (!s) {
      const mbCandidates = findMaybeboardCandidatesForName(ctx, copyList[0].card_name);
      copyList.forEach((copy) => {
        if (mbCandidates.length) {
          needsReview.push({
            copy,
            reason: 'maybeboard',
            candidates: mbCandidates,
            assigned_deck_id: '',
            destination_category: '',
            conflict_note:
              'Not in any swap queue. Found in maybeboard of: ' +
              mbCandidates.map((c) => c.deck_name).join(', '),
          });
        } else {
          needsReview.push({
            copy,
            reason: 'unmatched',
            candidates: [],
            assigned_deck_id: '',
            destination_category: '',
          });
        }
      });
      continue;
    }

    if (n >= s) {
      const free = freeCandidates(candidates);
      const assignCount = Math.min(n, free.length);
      for (let ci = 0; ci < assignCount; ci++) {
        assignments.push(makeAssignment(copyList[ci], free[ci], 'auto'));
        usedSlots[free[ci].slot_key] = true;
      }
      for (let ci = assignCount; ci < n; ci++) {
        needsReview.push({
          copy: copyList[ci],
          reason: 'extra',
          candidates: [],
          assigned_deck_id: '',
          destination_category: '',
        });
      }
      continue;
    }

    const freeForConflict = freeCandidates(candidates);
    const conflictNote =
      'Only ' +
      n +
      ' acquired; ' +
      s +
      ' deck(s) need this card: ' +
      candidates.map((c) => c.deck_name).join(', ');
    copyList.forEach((copy, idx) => {
      const preselected = freeForConflict[idx] || null;
      if (preselected) {
        usedSlots[preselected.slot_key] = true;
      }
      needsReview.push({
        copy,
        reason: 'conflict',
        candidates,
        all_candidates: candidates,
        totalDemand: s,
        assigned_deck_id: preselected ? preselected.deck_id : '',
        destination_category: preselected ? preselected.destination_category || '' : '',
        preselected_candidate: preselected,
        conflict_note: conflictNote,
      });
    });
  }

  return { assignmentIndex, copies, assignments, needsReview, colorIdentityCache };
}

function copyFieldsForReconcileItem(copyId: string, copies: CardCopy[]): { acquired_set: string | null; acquired_collector: string | null } {
  const copy = copies.find((c) => c.copy_id === copyId);
  if (!copy) {
    return { acquired_set: null, acquired_collector: null };
  }
  return {
    acquired_set: copy.set_code || null,
    acquired_collector: copy.collector_number || null,
  };
}

export function buildReconcileItems(state: OrderReconcileState): ReconcileItem[] {
  const reconcileItems: ReconcileItem[] = [];

  state.assignments.forEach((a) => {
    if (!a.deck_id) {
      return;
    }
    const acquired = copyFieldsForReconcileItem(a.copy_id, state.copies);
    reconcileItems.push({
      item_id: a.copy_id,
      copy_id: a.copy_id,
      slot_key: a.slot_key,
      deck_id: a.deck_id,
      deck_name: a.deck_name,
      card_name: a.card_name,
      quantity: 1,
      queued_in: a.queued_in,
      paired_out: a.paired_out,
      destination_category: a.destination_category,
      is_cube: !!a.is_cube,
      maybeboard_entry: a.maybeboard_entry || null,
      acquired_set: acquired.acquired_set,
      acquired_collector: acquired.acquired_collector,
      type: a.reason === 'unmatched' || a.reason === 'extra' ? 'assigned' : 'matched',
    });
  });

  state.needsReview.forEach((nr) => {
    if (!nr.assigned_deck_id) {
      return;
    }
    const deck = getDeckById(nr.assigned_deck_id, state.decks, state.stagingDeck, STAGING_DECK_ID);
    const candidate = (nr.candidates || []).find((c) => c.deck_id === nr.assigned_deck_id);
    const isCube = candidate ? !!candidate.is_cube : OrderReconcileExport.isCubeDeck(deck);
    const acquiredNr = copyFieldsForReconcileItem(nr.copy.copy_id, state.copies);
    reconcileItems.push({
      item_id: nr.copy.copy_id,
      copy_id: nr.copy.copy_id,
      slot_key: candidate ? candidate.slot_key : null,
      deck_id: nr.assigned_deck_id,
      deck_name: deck ? deck.deck_name : nr.assigned_deck_id,
      card_name: nr.copy.card_name,
      quantity: 1,
      queued_in: candidate ? candidate.queued_in : null,
      paired_out: candidate ? candidate.paired_out : null,
      destination_category: nr.destination_category || (candidate ? candidate.destination_category || '' : ''),
      is_cube: isCube,
      maybeboard_entry: candidate ? candidate.maybeboard_entry : null,
      acquired_set: acquiredNr.acquired_set,
      acquired_collector: acquiredNr.acquired_collector,
      type: nr.reason === 'unmatched' || nr.reason === 'extra' ? 'assigned' : 'matched',
    });
  });

  return reconcileItems;
}

export function acquiredCardImageSrc(copy: CardCopy): string {
  if (copy.set_code && copy.collector_number) {
    return scryfallImageFromPrinting(copy.set_code, copy.collector_number);
  }
  return scryfallImageFromName(copy.card_name);
}

export function slotCountByDeckForCard(state: Pick<OrderReconcileState, 'decks' | 'assignmentIndex'>, cardName: string): Record<string, number> {
  const candidates = findCandidatesForName(state, cardName);
  const slotCount: Record<string, number> = {};
  candidates.forEach((c) => {
    slotCount[c.deck_id] = (slotCount[c.deck_id] || 0) + 1;
  });
  return slotCount;
}

export function consumedByDeckForCard(
  state: Pick<OrderReconcileState, 'assignments' | 'needsReview'>,
  cardName: string,
  excludeReviewIdx?: number,
): Record<string, number> {
  const nameKey = cardName.toLowerCase();
  const consumed: Record<string, number> = {};
  state.assignments.forEach((a) => {
    if (a.card_name.toLowerCase() !== nameKey) {
      return;
    }
    consumed[a.deck_id] = (consumed[a.deck_id] || 0) + 1;
  });
  state.needsReview.forEach((nr, idx) => {
    if (idx === excludeReviewIdx || !nr.assigned_deck_id) {
      return;
    }
    if (nr.copy.card_name.toLowerCase() !== nameKey) {
      return;
    }
    consumed[nr.assigned_deck_id] = (consumed[nr.assigned_deck_id] || 0) + 1;
  });
  return consumed;
}

export function disabledDecksForReviewRow(
  state: Pick<OrderReconcileState, 'decks' | 'assignmentIndex' | 'assignments' | 'needsReview'>,
  nr: NeedsReviewItem,
  rowIdx: number,
): Record<string, boolean> {
  const slotCount = slotCountByDeckForCard(state, nr.copy.card_name);
  const consumed = consumedByDeckForCard(state, nr.copy.card_name, rowIdx);
  const disabled: Record<string, boolean> = {};
  Object.keys(slotCount).forEach((deckId) => {
    if ((consumed[deckId] || 0) >= slotCount[deckId] && nr.assigned_deck_id !== deckId) {
      disabled[deckId] = true;
    }
  });
  return disabled;
}

export function autoAssignedDeckNote(state: Pick<OrderReconcileState, 'assignments'>, cardName: string): string {
  const nameKey = cardName.toLowerCase();
  const names: string[] = [];
  const seen: Record<string, boolean> = {};
  state.assignments.forEach((a) => {
    if (a.card_name.toLowerCase() !== nameKey || seen[a.deck_id]) {
      return;
    }
    seen[a.deck_id] = true;
    names.push(a.deck_name);
  });
  return names.join(', ');
}
