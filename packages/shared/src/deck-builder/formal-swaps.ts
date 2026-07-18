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
  isSwapInCategory,
  isSwapOutCategory,
  isSwapQueueCategoryName,
} from '../mtg/swap-queue.js';
import { defaultAddCategory, ensureCategoryDef } from './card-edits.js';

const MAYBEBOARD = 'Maybeboard';

export function incompleteEntryCount(entries: FormalSwapEntry[]): number {
  return (entries || []).filter((e) => !e.inInstanceId || !e.outInstanceId).length;
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
 */
export function syncCardsWithFormalSwaps(
  deck: DeckDocument,
  entries?: FormalSwapEntry[],
): DeckDocument {
  const formalSwapEntries = normalizeFormalEntries(entries ?? deck.formalSwapEntries);
  const format = deck.format;
  const byId = new Map(
    (deck.cards || []).map((c) => [c.instanceId, { ...c, categories: [...(c.categories || [])] }]),
  );
  const referencedOut = new Set<string>();
  const referencedIn = new Set<string>();
  let categories = ensureSwapCategoryDefs(deck.categories || []);

  for (const entry of formalSwapEntries) {
    if (entry.outInstanceId && byId.has(entry.outInstanceId)) {
      referencedOut.add(entry.outInstanceId);
      const card = clearSwapCategories(byId.get(entry.outInstanceId)!, format);
      byId.set(entry.outInstanceId, setPrimaryCategory(card, SWAP_OUT));
    }
    if (entry.inInstanceId && byId.has(entry.inInstanceId)) {
      referencedIn.add(entry.inInstanceId);
      const cleared = clearSwapCategories(byId.get(entry.inInstanceId)!, format);
      const target =
        (entry.inTargetCategory && String(entry.inTargetCategory).trim()) ||
        (!isSwapQueueCategoryName(cleared.primaryCategory) ? cleared.primaryCategory : null) ||
        defaultAddCategory(deck);
      categories = ensureCategoryDef(categories, target);
      byId.set(entry.inInstanceId, setPrimaryCategory(cleared, target));
    }
  }

  const cards = (deck.cards || []).map((c) => {
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
 */
export function addCardsToSwapQueueAsOut(
  entries: FormalSwapEntry[],
  instanceIds: string[],
): FormalSwapEntry[] {
  const next = normalizeFormalEntries(entries);
  const usedOut = new Set(next.map((e) => e.outInstanceId).filter(Boolean) as string[]);

  for (const id of instanceIds || []) {
    if (!id || usedOut.has(id)) continue;
    const emptyIdx = next.findIndex((e) => !e.outInstanceId);
    if (emptyIdx >= 0) {
      next[emptyIdx] = { ...next[emptyIdx]!, outInstanceId: id };
    } else {
      next.push(newSwapEntry(next.length, id));
    }
    usedOut.add(id);
  }

  return next.map((e, i) => ({ ...e, sortIndex: i }));
}

/** Queue cards as Out and sync live deck categories (Outs leave the counted deck). */
export function queueCardsAsOut(deck: DeckDocument, instanceIds: string[]): DeckDocument {
  const entries = addCardsToSwapQueueAsOut(deck.formalSwapEntries, instanceIds);
  return syncCardsWithFormalSwaps(deck, entries);
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
