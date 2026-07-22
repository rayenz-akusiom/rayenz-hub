import type {
  CardInstance,
  CategoryDef,
  DeckDocument,
  DeckFormat,
  FormalSwapEntry,
  LookingForEntry,
} from '../schemas/deck-builder.js';
import {
  SEEKING,
  LOOKING_FOR,
  isSeekingCategory,
  isLookingForCategory,
  isSwapQueueCategoryName,
} from '../mtg/swap-queue.js';
import { defaultAddCategory, ensureCategoryDef } from './card-edits.js';
import { formalSwapInIds } from './formal-swaps.js';

const MAYBEBOARD = 'Maybeboard';

export type LookingForSyncResult = {
  deck: DeckDocument;
  warnings: string[];
};

export function normalizeLookingForEntries(entries: LookingForEntry[]): LookingForEntry[] {
  const list = (entries || []).map((e) => ({ ...e }));
  list.sort((a, b) => a.sortIndex - b.sortIndex || a.id.localeCompare(b.id));
  return list.map((e, i) => ({
    ...e,
    sortIndex: i,
    instanceId: e.instanceId,
    notes: e.notes ?? null,
  }));
}

function setPrimaryCategory(card: CardInstance, category: string): CardInstance {
  const cats = [...new Set([category, ...(card.categories || []).filter((c) => c !== category)])];
  return {
    ...card,
    primaryCategory: category,
    categories: cats,
  };
}

function clearSeekingCategory(card: CardInstance, format: DeckFormat): CardInstance {
  const cats = (card.categories || []).filter((c) => !isSeekingCategory(c));
  let primary = card.primaryCategory;
  if (isSeekingCategory(primary)) {
    primary = cats[0] || (format === 'cube' ? MAYBEBOARD : 'Other');
  }
  return { ...card, primaryCategory: primary, categories: cats.length ? cats : [primary] };
}

function formalSwapMemberIds(entries: FormalSwapEntry[] | null | undefined): Set<string> {
  const ids = formalSwapInIds(entries);
  for (const e of entries || []) {
    if (e.outInstanceId) ids.add(e.outInstanceId);
  }
  return ids;
}

/**
 * Drop Seeking entries whose instance is also a formal In/Out; prefer formal pairs.
 */
export function resolveLookingForConflicts(
  entries: LookingForEntry[],
  formalEntries: FormalSwapEntry[],
): { entries: LookingForEntry[]; warnings: string[] } {
  const formalIds = formalSwapMemberIds(formalEntries);
  const warnings: string[] = [];
  const kept: LookingForEntry[] = [];
  for (const e of entries || []) {
    if (formalIds.has(e.instanceId)) {
      warnings.push(
        `Seeking entry removed: instance ${e.instanceId} is already in a formal swap pair`,
      );
      continue;
    }
    kept.push(e);
  }
  return { entries: normalizeLookingForEntries(kept), warnings };
}

/**
 * Export projection: referenced Seeking instances → primary Seeking;
 * stale Seeking primaries cleared.
 */
export function applyLookingForToCards(
  cards: CardInstance[],
  entries: LookingForEntry[],
  format: DeckFormat,
): CardInstance[] {
  const byId = new Map(
    cards.map((c) => [c.instanceId, { ...c, categories: [...(c.categories || [])] }]),
  );
  const referenced = new Set<string>();

  for (const entry of normalizeLookingForEntries(entries)) {
    if (!entry.instanceId || !byId.has(entry.instanceId)) continue;
    referenced.add(entry.instanceId);
    const card = clearSeekingCategory(byId.get(entry.instanceId)!, format);
    byId.set(entry.instanceId, setPrimaryCategory(card, SEEKING));
  }

  return cards.map((c) => {
    if (referenced.has(c.instanceId)) {
      return byId.get(c.instanceId)!;
    }
    const existing = byId.get(c.instanceId)!;
    if (
      isSeekingCategory(existing.primaryCategory) ||
      (existing.categories || []).some((x) => isSeekingCategory(x))
    ) {
      return clearSeekingCategory(existing, format);
    }
    return existing;
  });
}

/**
 * Live Hub sync: Seeking entries get primary Seeking; ensure category def;
 * drop dangling / formal-conflict entries.
 */
export function syncCardsWithLookingFor(
  deck: DeckDocument,
  entries?: LookingForEntry[],
): LookingForSyncResult {
  const format = deck.format;
  const formalSwapEntries = deck.formalSwapEntries || [];
  const raw = normalizeLookingForEntries(entries ?? deck.lookingForEntries ?? []);
  const cardIds = new Set((deck.cards || []).map((c) => c.instanceId));
  const existingOnly = raw.filter((e) => cardIds.has(e.instanceId));
  const { entries: lookingForEntries, warnings } = resolveLookingForConflicts(
    existingOnly,
    formalSwapEntries,
  );

  const byId = new Map(
    (deck.cards || []).map((c) => [c.instanceId, { ...c, categories: [...(c.categories || [])] }]),
  );
  const referenced = new Set<string>();
  let categories: CategoryDef[] = ensureCategoryDef(deck.categories || [], SEEKING);

  for (const entry of lookingForEntries) {
    if (!byId.has(entry.instanceId)) continue;
    referenced.add(entry.instanceId);
    const cleared = clearSeekingCategory(byId.get(entry.instanceId)!, format);
    // Do not clear Queued In/Out membership here — conflict resolver already dropped overlaps.
    byId.set(entry.instanceId, setPrimaryCategory(cleared, SEEKING));
  }

  const cards = (deck.cards || []).map((c) => {
    if (referenced.has(c.instanceId)) {
      return byId.get(c.instanceId)!;
    }
    const existing = byId.get(c.instanceId)!;
    if (
      isSeekingCategory(existing.primaryCategory) ||
      (existing.categories || []).some((x) => isSeekingCategory(x))
    ) {
      return clearSeekingCategory(existing, format);
    }
    return existing;
  });

  return {
    deck: {
      ...deck,
      lookingForEntries,
      cards,
      categories,
      updatedAt: new Date().toISOString(),
    },
    warnings,
  };
}

/**
 * Seed Seeking entries from cards whose primary is Seeking (or legacy Looking For).
 * Does not treat Maybeboard as Seeking. Preserves existing ids when instance still Seeking.
 */
export function seedLookingForFromCategories(
  cards: CardInstance[],
  existing: LookingForEntry[] = [],
): LookingForEntry[] {
  const seekingCards = (cards || []).filter((c) => isSeekingCategory(c.primaryCategory));
  if (!seekingCards.length && !(existing || []).length) return [];

  const byInstance = new Map((existing || []).map((e) => [e.instanceId, e]));
  const next: LookingForEntry[] = [];
  seekingCards.forEach((card, i) => {
    const prev = byInstance.get(card.instanceId);
    next.push({
      id: prev?.id || `lf-seed-${i}-${card.instanceId}`,
      instanceId: card.instanceId,
      sortIndex: i,
      notes: prev?.notes ?? null,
    });
  });
  return normalizeLookingForEntries(next);
}

/** Fallback category when removing Seeking (same family as clearSwapCategories). */
export function lookingForFallbackCategory(
  deck: Pick<DeckDocument, 'categories' | 'format'>,
): string {
  if (deck.format === 'cube') return MAYBEBOARD;
  return defaultAddCategory(deck);
}

export { SEEKING, LOOKING_FOR, isSeekingCategory, isLookingForCategory, isSwapQueueCategoryName };
