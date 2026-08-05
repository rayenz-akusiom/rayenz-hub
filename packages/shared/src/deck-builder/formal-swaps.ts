import type {
  CardInstance,
  CategoryDef,
  DeckDocument,
  DeckFormat,
  FormalSwapEntry,
} from '../schemas/deck-builder.js';
import {
  SWAP_IN,
  SWAP_OUT,
  isSeekingCategory,
  isSwapInCategory,
  isSwapOutCategory,
  isSwapQueueCategoryName,
} from '../mtg/swap-queue.js';
import { categoryIncluded } from './browse.js';
import { ensureCategoryDef } from './card-edits.js';

const MAYBEBOARD = 'Maybeboard';

function defaultNextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Place In targets must be included in the deck — not Maybeboard, Seeking, or Queued*. */
export function isValidSwapInTargetCategory(
  categories: CategoryDef[],
  name: string | null | undefined,
): boolean {
  const n = String(name || '').trim();
  if (!n) return false;
  if (isSwapQueueCategoryName(n) || isSeekingCategory(n)) return false;
  return categoryIncluded(categories, n);
}

/** First deck-included category def, else Other. Never Maybeboard. */
export function defaultSwapInTargetCategory(
  deck: Pick<DeckDocument, 'categories'>,
): string {
  const cats = deck.categories || [];
  for (const c of cats) {
    if (isValidSwapInTargetCategory(cats, c.name)) return c.name;
  }
  return 'Other';
}

/**
 * Prefer the Out card's Hub category for Place In defaults.
 * After sync, primary may be Queued Out — fall back to the first usable secondary.
 * Only returns categories included in the deck (skips Maybeboard / Seeking / Queued*).
 */
export function inTargetCategoryFromOutCard(
  card: CardInstance | null | undefined,
  categories: CategoryDef[] = [],
): string | null {
  if (!card) return null;
  if (isValidSwapInTargetCategory(categories, card.primaryCategory)) {
    return String(card.primaryCategory).trim();
  }
  for (const c of card.categories || []) {
    if (isValidSwapInTargetCategory(categories, c)) return String(c).trim();
  }
  return null;
}

/**
 * Resolve a Place In category: valid requested → Out-derived included → deck default.
 * Never returns Maybeboard or other aside categories.
 */
export function resolveSwapInTargetCategory(
  deck: Pick<DeckDocument, 'categories'>,
  requested: string | null | undefined,
  fallbackCard?: CardInstance | null,
): string {
  const cats = deck.categories || [];
  if (isValidSwapInTargetCategory(cats, requested)) {
    return String(requested).trim();
  }
  const fromCard = inTargetCategoryFromOutCard(fallbackCard, cats);
  if (fromCard) return fromCard;
  return defaultSwapInTargetCategory(deck);
}

export function incompleteEntryCount(entries: FormalSwapEntry[]): number {
  return (entries || []).filter((e) => !e.inInstanceId || !e.outInstanceId).length;
}

/** Empty formal swap pair (Deck Builder / Swap Queue Add). */
export function newFormalSwapEntry(sortIndex: number): FormalSwapEntry {
  return {
    id: `swap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    inInstanceId: null,
    outInstanceId: null,
    inTargetCategory: null,
    sortIndex,
    notes: null,
  };
}

export function normalizeFormalEntries(entries: FormalSwapEntry[]): FormalSwapEntry[] {
  const list = (entries || []).map((e) => ({ ...e }));
  list.sort((a, b) => a.sortIndex - b.sortIndex || a.id.localeCompare(b.id));
  return list.map((e, i) => ({
    ...e,
    sortIndex: i,
    inInstanceId: e.inInstanceId || null,
    outInstanceId: e.outInstanceId || null,
    inTargetCategory: e.inTargetCategory ?? null,
    notes: e.notes ?? null,
  }));
}

/** Instance IDs currently assigned as formal swap Ins (live main-deck ghosts). */
export function formalSwapInIds(entries: FormalSwapEntry[] | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const e of entries || []) {
    if (e.inInstanceId) ids.add(e.inInstanceId);
  }
  return ids;
}

function setPrimaryCategory(card: CardInstance, category: string): CardInstance {
  const cats = [...new Set([category, ...(card.categories || []).filter((c) => c !== category)])];
  return {
    ...card,
    primaryCategory: category,
    categories: cats,
  };
}

function clearSwapCategories(card: CardInstance, format: DeckFormat): CardInstance {
  const cats = (card.categories || []).filter((c) => !isSwapQueueCategoryName(c));
  let primary = card.primaryCategory;
  if (isSwapQueueCategoryName(primary)) {
    primary = cats[0] || (format === 'cube' ? MAYBEBOARD : 'Other');
  }
  return { ...card, primaryCategory: primary, categories: cats.length ? cats : [primary] };
}

function ensureSwapCategoryDefs(categories: CategoryDef[]): CategoryDef[] {
  let next = ensureCategoryDef(categories, SWAP_OUT);
  next = ensureCategoryDef(next, SWAP_IN);
  return next;
}

/** Identity for merging a split singleton back into a multi-qty stack. */
function stackMergeKey(card: CardInstance): string {
  return [
    String(card.name || ''),
    String(card.setCode || ''),
    String(card.collectorNumber || ''),
    String(card.scryfallId || ''),
    card.foil ? '1' : '0',
    card.proxy ? '1' : '0',
    String(card.primaryCategory || ''),
    String(card.stack || ''),
  ].join('\0');
}

/**
 * Peel one copy off a multi-qty instance for use as a formal Out.
 * Qty ≤ 1: unchanged. Qty > 1: decrement stack, insert a qty-1 clone, return its id.
 */
export function splitOutInstance(
  cards: CardInstance[],
  instanceId: string,
  nextId: (prefix: string) => string = defaultNextId,
): { cards: CardInstance[]; outInstanceId: string } {
  const idx = cards.findIndex((c) => c.instanceId === instanceId);
  if (idx < 0) return { cards, outInstanceId: instanceId };
  const card = cards[idx]!;
  const qty = Math.max(1, Number(card.quantity) || 1);
  if (qty <= 1) return { cards, outInstanceId: instanceId };

  const newId = nextId('c');
  const clone: CardInstance = {
    ...card,
    instanceId: newId,
    quantity: 1,
    categories: [...(card.categories || [])],
    foil: Boolean(card.foil),
    proxy: Boolean(card.proxy),
  };
  const next = cards.map((c, i) => (i === idx ? { ...c, quantity: qty - 1 } : { ...c }));
  next.splice(idx + 1, 0, clone);
  return { cards: next, outInstanceId: newId };
}

function materializeOutSplits(
  cards: CardInstance[],
  entries: FormalSwapEntry[],
  nextId: (prefix: string) => string = defaultNextId,
): { cards: CardInstance[]; entries: FormalSwapEntry[] } {
  let nextCards = cards.map((c) => ({ ...c, categories: [...(c.categories || [])] }));
  const nextEntries = entries.map((e) => ({ ...e }));

  for (const entry of nextEntries) {
    if (!entry.outInstanceId) continue;
    const split = splitOutInstance(nextCards, entry.outInstanceId, nextId);
    nextCards = split.cards;
    entry.outInstanceId = split.outInstanceId;
  }

  return { cards: nextCards, entries: nextEntries };
}

/**
 * Merge a restored qty-1 card into a matching in-deck stack (same printing + category).
 * Used after clearing a formal Out so basic-land stacks recombine.
 */
export function mergeCardIntoMatchingStack(
  cards: CardInstance[],
  instanceId: string,
): CardInstance[] {
  const idx = cards.findIndex((c) => c.instanceId === instanceId);
  if (idx < 0) return cards;
  const card = cards[idx]!;
  const qty = Math.max(1, Number(card.quantity) || 1);
  if (qty !== 1) return cards;
  if (isSwapOutCategory(card.primaryCategory) || isSwapInCategory(card.primaryCategory)) {
    return cards;
  }

  const key = stackMergeKey(card);
  const targetIdx = cards.findIndex(
    (c, i) =>
      i !== idx &&
      stackMergeKey(c) === key &&
      !isSwapOutCategory(c.primaryCategory) &&
      !isSwapInCategory(c.primaryCategory),
  );
  if (targetIdx < 0) return cards;

  const targetId = cards[targetIdx]!.instanceId;
  const next = cards.filter((_, i) => i !== idx);
  return next.map((c) =>
    c.instanceId === targetId
      ? { ...c, quantity: (Number(c.quantity) || 1) + qty }
      : c,
  );
}

/**
 * Returns a copy of cards with swap category membership derived from formal entries.
 * Cards not referenced keep non-swap categories (stale In/Out cleared).
 * Export-only projection: In → Queued In, Out → Queued Out (Commander and cube).
 */
export function applyFormalSwapsToCards(
  cards: CardInstance[],
  entries: FormalSwapEntry[],
  format: DeckFormat,
): CardInstance[] {
  const byId = new Map(cards.map((c) => [c.instanceId, { ...c, categories: [...(c.categories || [])] }]));
  const referenced = new Set<string>();

  for (const entry of normalizeFormalEntries(entries)) {
    if (entry.inInstanceId && byId.has(entry.inInstanceId)) {
      referenced.add(entry.inInstanceId);
      const card = clearSwapCategories(byId.get(entry.inInstanceId)!, format);
      byId.set(entry.inInstanceId, setPrimaryCategory(card, SWAP_IN));
    }
    if (entry.outInstanceId && byId.has(entry.outInstanceId)) {
      referenced.add(entry.outInstanceId);
      const card = clearSwapCategories(byId.get(entry.outInstanceId)!, format);
      byId.set(entry.outInstanceId, setPrimaryCategory(card, SWAP_OUT));
    }
  }

  return cards.map((c) => {
    if (referenced.has(c.instanceId)) {
      return byId.get(c.instanceId)!;
    }
    const existing = byId.get(c.instanceId)!;
    if (
      isSwapInCategory(existing.primaryCategory) ||
      isSwapOutCategory(existing.primaryCategory) ||
      (existing.categories || []).some((x) => isSwapQueueCategoryName(x))
    ) {
      return clearSwapCategories(existing, format);
    }
    return existing;
  });
}

/**
 * Live Hub projection: Outs → Queued Out (leave deck); Ins → target/default category (stay in deck).
 * Multi-qty Outs are split so only one copy leaves the counted deck.
 */
export function syncCardsWithFormalSwaps(
  deck: DeckDocument,
  entries?: FormalSwapEntry[],
  opts?: { nextId?: (prefix: string) => string },
): DeckDocument {
  const nextId = opts?.nextId || defaultNextId;
  const previouslyOut = new Set(
    (deck.cards || [])
      .filter((c) => isSwapOutCategory(c.primaryCategory))
      .map((c) => c.instanceId),
  );

  const materialized = materializeOutSplits(
    deck.cards || [],
    normalizeFormalEntries(entries ?? deck.formalSwapEntries),
    nextId,
  );
  const formalSwapEntries = normalizeFormalEntries(materialized.entries);
  const format = deck.format;
  const byId = new Map(
    materialized.cards.map((c) => [c.instanceId, { ...c, categories: [...(c.categories || [])] }]),
  );
  const referencedOut = new Set<string>();
  const referencedIn = new Set<string>();
  let categories = ensureSwapCategoryDefs(deck.categories || []);
  const deckForResolve = { categories };

  for (const entry of formalSwapEntries) {
    if (entry.outInstanceId && byId.has(entry.outInstanceId)) {
      referencedOut.add(entry.outInstanceId);
      const card = clearSwapCategories(byId.get(entry.outInstanceId)!, format);
      byId.set(entry.outInstanceId, setPrimaryCategory(card, SWAP_OUT));
    }
  }

  for (const entry of formalSwapEntries) {
    const outCard = entry.outInstanceId ? byId.get(entry.outInstanceId) ?? null : null;
    if (
      entry.inTargetCategory != null &&
      !isValidSwapInTargetCategory(categories, entry.inTargetCategory)
    ) {
      entry.inTargetCategory = resolveSwapInTargetCategory(deckForResolve, null, outCard);
    }

    if (entry.inInstanceId && byId.has(entry.inInstanceId)) {
      referencedIn.add(entry.inInstanceId);
      const cleared = clearSwapCategories(byId.get(entry.inInstanceId)!, format);
      const target = resolveSwapInTargetCategory(
        deckForResolve,
        entry.inTargetCategory,
        outCard,
      );
      entry.inTargetCategory = target;
      categories = ensureCategoryDef(categories, target);
      byId.set(entry.inInstanceId, setPrimaryCategory(cleared, target));
    }
  }

  let cards = materialized.cards.map((c) => {
    if (referencedOut.has(c.instanceId) || referencedIn.has(c.instanceId)) {
      return byId.get(c.instanceId)!;
    }
    const existing = byId.get(c.instanceId)!;
    if (
      isSwapInCategory(existing.primaryCategory) ||
      isSwapOutCategory(existing.primaryCategory) ||
      (existing.categories || []).some((x) => isSwapQueueCategoryName(x))
    ) {
      return clearSwapCategories(existing, format);
    }
    return existing;
  });

  for (const id of previouslyOut) {
    if (referencedOut.has(id)) continue;
    cards = mergeCardIntoMatchingStack(cards, id);
  }

  return {
    ...deck,
    formalSwapEntries,
    cards,
    categories,
    updatedAt: new Date().toISOString(),
  };
}

function newSwapEntry(sortIndex: number, outInstanceId: string | null = null): FormalSwapEntry {
  return {
    id: `swap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    inInstanceId: null,
    outInstanceId,
    inTargetCategory: null,
    sortIndex,
    notes: null,
  };
}

/**
 * Queue card instance IDs as Out: fill the first empty out slots (by sortIndex), then
 * append uneven pairs. Skips IDs already used as an outInstanceId.
 * When `categoryForOut` is provided and an entry's inTargetCategory is null, set it
 * from that callback for newly assigned Outs.
 */
export function addCardsToSwapQueueAsOut(
  entries: FormalSwapEntry[],
  instanceIds: string[],
  opts?: { categoryForOut?: (instanceId: string) => string | null },
): FormalSwapEntry[] {
  const next = normalizeFormalEntries(entries);
  const usedOut = new Set(next.map((e) => e.outInstanceId).filter(Boolean) as string[]);
  const categoryForOut = opts?.categoryForOut;

  for (const id of instanceIds || []) {
    if (!id || usedOut.has(id)) continue;
    const emptyIdx = next.findIndex((e) => !e.outInstanceId);
    if (emptyIdx >= 0) {
      const prev = next[emptyIdx]!;
      const inTargetCategory =
        prev.inTargetCategory ?? (categoryForOut ? categoryForOut(id) : null) ?? null;
      next[emptyIdx] = { ...prev, outInstanceId: id, inTargetCategory };
    } else {
      const inTargetCategory = (categoryForOut ? categoryForOut(id) : null) ?? null;
      next.push({ ...newSwapEntry(next.length, id), inTargetCategory });
    }
    usedOut.add(id);
  }

  return next.map((e, i) => ({ ...e, sortIndex: i }));
}

/** Queue cards as Out and sync live deck categories (Outs leave the counted deck). */
export function queueCardsAsOut(deck: DeckDocument, instanceIds: string[]): DeckDocument {
  const byId = new Map((deck.cards || []).map((c) => [c.instanceId, c]));
  const cats = deck.categories || [];
  const entries = addCardsToSwapQueueAsOut(deck.formalSwapEntries, instanceIds, {
    categoryForOut: (id) => inTargetCategoryFromOutCard(byId.get(id), cats),
  });
  return syncCardsWithFormalSwaps(deck, entries);
}

/**
 * Permanently commit a complete formal swap: delete Out, keep In in its target
 * category, and drop the queue entry. Returns null if the entry is missing,
 * incomplete, or either instance is not on the deck.
 *
 * Must delete Out before dropping the entry — removing the entry alone via sync
 * would restore Out into the counted deck.
 */
export function finalizeFormalSwap(
  deck: DeckDocument,
  entryId: string,
): DeckDocument | null {
  const entry = (deck.formalSwapEntries || []).find((e) => e.id === entryId);
  if (!entry?.inInstanceId || !entry?.outInstanceId) return null;

  const cards = deck.cards || [];
  const inCard = cards.find((c) => c.instanceId === entry.inInstanceId);
  const outCard = cards.find((c) => c.instanceId === entry.outInstanceId);
  if (!inCard || !outCard) return null;

  const format = deck.format;
  const cleared = clearSwapCategories(inCard, format);
  const target = resolveSwapInTargetCategory(deck, entry.inTargetCategory, outCard);
  let categories = ensureCategoryDef(deck.categories || [], target);
  categories = ensureSwapCategoryDefs(categories);
  const placedIn = setPrimaryCategory(cleared, target);

  const nextCards = cards
    .filter((c) => c.instanceId !== entry.outInstanceId)
    .map((c) => (c.instanceId === entry.inInstanceId ? placedIn : c));

  const remaining = (deck.formalSwapEntries || [])
    .filter((e) => e.id !== entryId)
    .map((e, i) => ({ ...e, sortIndex: i }));

  const nextDeck: DeckDocument = {
    ...deck,
    cards: nextCards,
    categories,
    formalSwapEntries: remaining,
    coverInstanceId:
      deck.coverInstanceId === entry.outInstanceId ? null : deck.coverInstanceId ?? null,
    lookingForEntries: (deck.lookingForEntries || []).filter(
      (e) => e.instanceId !== entry.outInstanceId,
    ),
    updatedAt: new Date().toISOString(),
  };

  return syncCardsWithFormalSwaps(nextDeck, remaining);
}

/**
 * Best-effort pair Queued In / Queued Out (and legacy New Set In/Out) into formal swap entries.
 * If existingEntries is non-empty, returns it unchanged.
 */
export function seedFormalSwapsFromCategories(
  cards: CardInstance[],
  existingEntries: FormalSwapEntry[] = [],
): FormalSwapEntry[] {
  if ((existingEntries || []).length > 0) {
    return normalizeFormalEntries(existingEntries);
  }
  const ins = (cards || []).filter((c) => isSwapInCategory(c.primaryCategory));
  const outs = (cards || []).filter((c) => isSwapOutCategory(c.primaryCategory));
  const n = Math.max(ins.length, outs.length);
  if (n === 0) return [];
  const entries: FormalSwapEntry[] = [];
  for (let i = 0; i < n; i++) {
    entries.push({
      id: `swap-seed-${i}-${ins[i]?.instanceId || 'x'}-${outs[i]?.instanceId || 'x'}`,
      inInstanceId: ins[i]?.instanceId ?? null,
      outInstanceId: outs[i]?.instanceId ?? null,
      inTargetCategory: null,
      sortIndex: i,
      notes: null,
    });
  }
  return entries;
}

export { SWAP_IN, SWAP_OUT, MAYBEBOARD };
