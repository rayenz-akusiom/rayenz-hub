import type { CardInstance, DeckFormat, FormalSwapEntry } from '../schemas/deck-builder.js';

const SWAP_IN = 'New Set In';
const SWAP_OUT = 'New Set Out';
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

function setPrimaryCategory(card: CardInstance, category: string): CardInstance {
  const cats = [...new Set([category, ...(card.categories || []).filter((c) => c !== category)])];
  return {
    ...card,
    primaryCategory: category,
    categories: cats,
  };
}

function clearSwapCategories(card: CardInstance, format: DeckFormat): CardInstance {
  const strip = new Set([SWAP_IN, SWAP_OUT]);
  if (format === 'cube') {
    // Keep Maybeboard if it was structural; only clear In/Out tags from primary when they were swap sides
  }
  const cats = (card.categories || []).filter((c) => !strip.has(c));
  let primary = card.primaryCategory;
  if (strip.has(primary)) {
    primary = cats[0] || (format === 'cube' ? MAYBEBOARD : 'Other');
  }
  return { ...card, primaryCategory: primary, categories: cats.length ? cats : [primary] };
}

/**
 * Returns a copy of cards with swap category membership derived from formal entries.
 * Cards not referenced keep non-swap categories (stale In/Out cleared).
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
      if (format === 'cube') {
        const withMb = setPrimaryCategory(card, MAYBEBOARD);
        const cats = [...new Set([MAYBEBOARD, SWAP_IN, ...(withMb.categories || [])])];
        byId.set(entry.inInstanceId, { ...withMb, categories: cats });
      } else {
        byId.set(entry.inInstanceId, setPrimaryCategory(card, SWAP_IN));
      }
    }
    if (entry.outInstanceId && byId.has(entry.outInstanceId)) {
      referenced.add(entry.outInstanceId);
      const card = clearSwapCategories(byId.get(entry.outInstanceId)!, format);
      if (format === 'cube') {
        const withMb = setPrimaryCategory(card, MAYBEBOARD);
        const cats = [...new Set([MAYBEBOARD, SWAP_OUT, ...(withMb.categories || [])])];
        byId.set(entry.outInstanceId, { ...withMb, categories: cats });
      } else {
        byId.set(entry.outInstanceId, setPrimaryCategory(card, SWAP_OUT));
      }
    }
  }

  return cards.map((c) => {
    if (referenced.has(c.instanceId)) {
      return byId.get(c.instanceId)!;
    }
    const existing = byId.get(c.instanceId)!;
    if (
      existing.primaryCategory === SWAP_IN ||
      existing.primaryCategory === SWAP_OUT ||
      (existing.categories || []).some((x) => x === SWAP_IN || x === SWAP_OUT)
    ) {
      return clearSwapCategories(existing, format);
    }
    return existing;
  });
}

/**
 * Best-effort pair New Set In / New Set Out into formal swap entries.
 * If existingEntries is non-empty, returns it unchanged.
 */
export function seedFormalSwapsFromCategories(
  cards: CardInstance[],
  existingEntries: FormalSwapEntry[] = [],
): FormalSwapEntry[] {
  if ((existingEntries || []).length > 0) {
    return normalizeFormalEntries(existingEntries);
  }
  const ins = (cards || []).filter((c) => c.primaryCategory === SWAP_IN);
  const outs = (cards || []).filter((c) => c.primaryCategory === SWAP_OUT);
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
