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
import { categoryIncluded } from './browse.js';
import { defaultAddCategory, ensureCategoryDef } from './card-edits.js';
import { formalSwapInIds } from './formal-swaps.js';
import { isBasicLand } from './quantities.js';

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

function clearSeekingCategory(card: CardInstance, format: DeckFormat): CardInstance {
  const cats = (card.categories || []).filter((c) => !isSeekingCategory(c));
  let primary = card.primaryCategory;
  if (isSeekingCategory(primary)) {
    primary = cats[0] || (format === 'cube' ? MAYBEBOARD : 'Other');
  }
  return { ...card, primaryCategory: primary, categories: cats.length ? cats : [primary] };
}

/** True when primary or any category membership is Seeking (or legacy Looking For). */
export function cardIsSeekingMarked(
  card: Pick<CardInstance, 'primaryCategory' | 'categories'>,
): boolean {
  if (isSeekingCategory(card.primaryCategory)) return true;
  return (card.categories || []).some((c) => isSeekingCategory(c));
}

/** Keep primary; ensure canonical Seeking is present as a secondary category. */
function ensureSeekingSecondary(card: CardInstance): CardInstance {
  const primary = card.primaryCategory;
  const withoutSeeking = (card.categories || []).filter((c) => !isSeekingCategory(c));
  const categories = [
    ...new Set([primary, ...withoutSeeking.filter((c) => c !== primary), SEEKING]),
  ];
  return { ...card, primaryCategory: primary, categories };
}

/**
 * Apply one Looking For row onto a card.
 * Primary Seeking (or legacy) stays primary Seeking; otherwise Seeking is secondary only.
 */
function applySeekingMembership(card: CardInstance): CardInstance {
  if (isSeekingCategory(card.primaryCategory)) {
    // Normalize primary Seeking; keep intentional non-Seeking secondaries only
    // (do not clear→fallback→re-primary, which left Other as a sticky secondary).
    const kept = (card.categories || []).filter(
      (c) => !isSeekingCategory(c) && c !== card.primaryCategory,
    );
    return {
      ...card,
      primaryCategory: SEEKING,
      categories: [...new Set([SEEKING, ...kept])],
    };
  }
  return ensureSeekingSecondary(card);
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
 * Export projection: referenced Seeking instances keep primary Seeking when already
 * primary Seeking; otherwise Seeking is applied as a secondary category.
 * Stale Seeking membership on unreferenced cards is cleared.
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
    byId.set(entry.instanceId, applySeekingMembership(byId.get(entry.instanceId)!));
  }

  return cards.map((c) => {
    if (referenced.has(c.instanceId)) {
      return byId.get(c.instanceId)!;
    }
    const existing = byId.get(c.instanceId)!;
    if (cardIsSeekingMarked(existing)) {
      return clearSeekingCategory(existing, format);
    }
    return existing;
  });
}

/**
 * Live Hub sync: Looking For entries get Seeking membership (primary if already
 * primary Seeking, else secondary); ensure category def; drop dangling / formal conflicts.
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
  const categories: CategoryDef[] = ensureCategoryDef(deck.categories || [], SEEKING);

  for (const entry of lookingForEntries) {
    if (!byId.has(entry.instanceId)) continue;
    referenced.add(entry.instanceId);
    // Do not clear Queued In/Out membership here — conflict resolver already dropped overlaps.
    byId.set(entry.instanceId, applySeekingMembership(byId.get(entry.instanceId)!));
  }

  const cards = (deck.cards || []).map((c) => {
    if (referenced.has(c.instanceId)) {
      return byId.get(c.instanceId)!;
    }
    const existing = byId.get(c.instanceId)!;
    if (cardIsSeekingMarked(existing)) {
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
 * Seed Seeking entries from cards whose primary is Seeking (or legacy Looking For),
 * or that carry Seeking as a secondary category. Preserves existing ids when still Seeking.
 */
export function seedLookingForFromCategories(
  cards: CardInstance[],
  existing: LookingForEntry[] = [],
): LookingForEntry[] {
  const seekingCards = (cards || []).filter((c) => cardIsSeekingMarked(c));
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

/**
 * Re-seed Seeking entries from Seeking-marked cards, then sync category membership.
 * Use after add/move/remove so lookingForEntries stays aligned with card categories.
 */
export function reconcileLookingForFromCards(deck: DeckDocument): DeckDocument {
  return syncCardsWithLookingFor(
    deck,
    seedLookingForFromCategories(deck.cards, deck.lookingForEntries || []),
  ).deck;
}

function canMarkSeekingSecondary(card: CardInstance): boolean {
  if (cardIsSeekingMarked(card)) return false;
  if (isSwapQueueCategoryName(card.primaryCategory)) return false;
  return true;
}

function addSeekingSecondaryToCards(
  deck: DeckDocument,
  instanceIds: ReadonlySet<string>,
): DeckDocument {
  let changed = false;
  const cards = (deck.cards || []).map((c) => {
    if (!instanceIds.has(c.instanceId)) return c;
    if (!canMarkSeekingSecondary(c)) return c;
    changed = true;
    return ensureSeekingSecondary(c);
  });
  if (!changed) {
    const categories = ensureCategoryDef(deck.categories || [], SEEKING);
    return categories === deck.categories ? deck : { ...deck, categories };
  }
  return reconcileLookingForFromCards({
    ...deck,
    cards,
    categories: ensureCategoryDef(deck.categories || [], SEEKING),
  });
}

/**
 * Mark selected cards Seeking as a secondary category (keeps primary / in-deck).
 * Basics are allowed — explicit selection counts as specifically marked.
 */
export function markCardsSeekingSecondary(
  deck: DeckDocument,
  instanceIds: string[],
): DeckDocument {
  const ids = new Set((instanceIds || []).filter(Boolean));
  if (!ids.size) return deck;
  return addSeekingSecondaryToCards(deck, ids);
}

function isMainDeckSeekingCandidate(
  deck: Pick<DeckDocument, 'categories'>,
  card: CardInstance,
): boolean {
  const primary = card.primaryCategory || 'Other';
  if (isSeekingCategory(primary)) return false;
  if (isSwapQueueCategoryName(primary)) return false;
  if (!categoryIncluded(deck.categories || [], primary)) return false;
  return true;
}

/**
 * Mark all included main-deck cards Seeking as secondary.
 * Skips basic lands unless they are already Seeking-marked.
 */
export function markMainDeckSeekingSecondary(deck: DeckDocument): DeckDocument {
  const ids = new Set<string>();
  for (const card of deck.cards || []) {
    if (!isMainDeckSeekingCandidate(deck, card)) continue;
    if (cardIsSeekingMarked(card)) continue;
    if (isBasicLand(card)) continue;
    ids.add(card.instanceId);
  }
  if (!ids.size) {
    return {
      ...deck,
      categories: ensureCategoryDef(deck.categories || [], SEEKING),
    };
  }
  return addSeekingSecondaryToCards(deck, ids);
}

export { SEEKING, LOOKING_FOR, isSeekingCategory, isLookingForCategory, isSwapQueueCategoryName };
