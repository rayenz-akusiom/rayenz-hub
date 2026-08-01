import type { DeckDocument, FormalSwapEntry, LookingForEntry } from '../schemas/deck-builder.js';
import { categoryIncluded, isSwapQueueCategory } from './browse.js';
import { defaultAddCategory, ensureCategoryDef, removeCardFromDeck } from './card-edits.js';
import { getOracle, oracleKey } from './card-oracle.js';
import { syncCardsWithFormalSwaps } from './formal-swaps.js';
import { SEEKING, syncCardsWithLookingFor } from './looking-for.js';

function defaultNextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export type FormalSwapRetargetDraft = {
  inInstanceId?: string | null;
  inTargetCategory?: string | null;
  notes?: string | null;
};

function resolveInTargetCategory(
  target: DeckDocument,
  requested: string | null | undefined,
): string | null {
  const name = String(requested || '').trim();
  if (!name) return null;
  if (!categoryIncluded(target.categories || [], name)) return null;
  if (isSwapQueueCategory(name)) return null;
  return name;
}

/**
 * Copy a card instance (+ oracle) onto `to` under `primaryCategory`, then remove it from `from`.
 * Assigns a new instanceId on the destination.
 */
export function transplantCardInstance(
  from: DeckDocument,
  to: DeckDocument,
  instanceId: string,
  primaryCategory: string,
  opts?: { nextId?: (prefix: string) => string },
): { from: DeckDocument; to: DeckDocument; newInstanceId: string } | null {
  const card = (from.cards || []).find((c) => c.instanceId === instanceId);
  if (!card) return null;

  const nextId = opts?.nextId || defaultNextId;
  const newInstanceId = nextId('c');
  const category = String(primaryCategory || '').trim() || defaultAddCategory(to);
  const cloned = {
    ...card,
    instanceId: newInstanceId,
    primaryCategory: category,
    categories: [category],
  };

  const key = oracleKey(card);
  const oracleEntry = getOracle(from, card);
  const nextOracle = { ...(to.oracle || {}) };
  if (oracleEntry) {
    nextOracle[key] = { ...oracleEntry };
  } else if (from.oracle?.[key]) {
    nextOracle[key] = { ...from.oracle[key]! };
  }

  const nextTo: DeckDocument = {
    ...to,
    cards: [...(to.cards || []), cloned],
    oracle: nextOracle,
    categories: ensureCategoryDef(to.categories || [], category),
    updatedAt: new Date().toISOString(),
  };

  const nextFrom = removeCardFromDeck(from, instanceId);
  return { from: nextFrom, to: nextTo, newInstanceId };
}

/**
 * Move a formal swap entry from `source` to `target`, clearing Out.
 * In is transplanted when it still lives on source; reused when already on target.
 */
export function retargetFormalSwap(
  source: DeckDocument,
  target: DeckDocument,
  entryId: string,
  draft?: FormalSwapRetargetDraft,
  opts?: { nextId?: (prefix: string) => string },
): { source: DeckDocument; target: DeckDocument } | null {
  if (source.deckId === target.deckId) return null;
  const entry = (source.formalSwapEntries || []).find((e) => e.id === entryId);
  if (!entry) return null;

  const draftIn = draft?.inInstanceId !== undefined ? draft.inInstanceId : entry.inInstanceId;
  const notes =
    draft?.notes !== undefined ? String(draft.notes || '').trim() || null : entry.notes ?? null;
  let inTargetCategory = resolveInTargetCategory(
    target,
    draft?.inTargetCategory !== undefined ? draft.inTargetCategory : entry.inTargetCategory,
  );

  let nextSource = syncCardsWithFormalSwaps(
    source,
    (source.formalSwapEntries || []).filter((e) => e.id !== entryId),
  );
  let nextTarget = target;
  let newInId: string | null = null;

  if (draftIn && (nextTarget.cards || []).some((c) => c.instanceId === draftIn)) {
    newInId = draftIn;
    const category = inTargetCategory || defaultAddCategory(nextTarget);
    inTargetCategory = category;
    if (
      entry.inInstanceId &&
      entry.inInstanceId !== draftIn &&
      (nextSource.cards || []).some((c) => c.instanceId === entry.inInstanceId)
    ) {
      nextSource = removeCardFromDeck(nextSource, entry.inInstanceId);
    }
  } else if (draftIn && (nextSource.cards || []).some((c) => c.instanceId === draftIn)) {
    const category = inTargetCategory || defaultAddCategory(nextTarget);
    const moved = transplantCardInstance(nextSource, nextTarget, draftIn, category, opts);
    if (moved) {
      nextSource = moved.from;
      nextTarget = moved.to;
      newInId = moved.newInstanceId;
      inTargetCategory = category;
      if (
        entry.inInstanceId &&
        entry.inInstanceId !== draftIn &&
        (nextSource.cards || []).some((c) => c.instanceId === entry.inInstanceId)
      ) {
        nextSource = removeCardFromDeck(nextSource, entry.inInstanceId);
      }
    }
  } else if (
    entry.inInstanceId &&
    (nextSource.cards || []).some((c) => c.instanceId === entry.inInstanceId)
  ) {
    // Draft cleared In (or dangling): drop leftover source In.
    nextSource = removeCardFromDeck(nextSource, entry.inInstanceId);
  }

  const newEntry: FormalSwapEntry = {
    id: entry.id,
    inInstanceId: newInId,
    outInstanceId: null,
    inTargetCategory: newInId ? inTargetCategory : null,
    sortIndex: (nextTarget.formalSwapEntries || []).length,
    notes,
  };

  nextTarget = syncCardsWithFormalSwaps(nextTarget, [
    ...(nextTarget.formalSwapEntries || []),
    newEntry,
  ]);

  return { source: nextSource, target: nextTarget };
}

/**
 * Move a Seeking entry (+ card) from `source` to `target`.
 */
export function retargetLookingFor(
  source: DeckDocument,
  target: DeckDocument,
  entryId: string,
  opts?: { nextId?: (prefix: string) => string },
): { source: DeckDocument; target: DeckDocument } | null {
  if (source.deckId === target.deckId) return null;
  const entry = (source.lookingForEntries || []).find((e) => e.id === entryId);
  if (!entry) return null;

  const instanceId = entry.instanceId;
  if (!(source.cards || []).some((c) => c.instanceId === instanceId)) {
    const nextSource = syncCardsWithLookingFor(
      source,
      (source.lookingForEntries || []).filter((e) => e.id !== entryId),
    ).deck;
    return { source: nextSource, target };
  }

  const moved = transplantCardInstance(source, target, instanceId, SEEKING, opts);
  if (!moved) return null;

  // removeCardFromDeck already dropped the looking-for row keyed by instance.
  const nextSource = syncCardsWithLookingFor(
    moved.from,
    (moved.from.lookingForEntries || []).filter((e) => e.id !== entryId),
  ).deck;

  const newLookingFor: LookingForEntry = {
    id: entry.id,
    instanceId: moved.newInstanceId,
    sortIndex: (moved.to.lookingForEntries || []).length,
    notes: entry.notes ?? null,
  };

  const nextTarget = syncCardsWithLookingFor(moved.to, [
    ...(moved.to.lookingForEntries || []),
    newLookingFor,
  ]).deck;

  return { source: nextSource, target: nextTarget };
}
