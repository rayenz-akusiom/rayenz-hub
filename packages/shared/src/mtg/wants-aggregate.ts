import type { CardInstance, DeckDocument } from '../schemas/deck-builder.js';
import { cardDisplayName, getOracle, resolveCardView } from '../deck-builder/card-oracle.js';

export type WantSourceKind = 'seeking' | 'queued_in' | 'queued_out';

export type WantSource = {
  deckId: string;
  deckName: string;
  format: DeckDocument['format'];
  kind: WantSourceKind;
  entryId: string;
  cardInstanceId: string;
  /** Printing-sought face name for this source. */
  cardName: string;
  /** Oracle id when known, else normalized printing-sought name. */
  mergeKey: string;
  quantity: number;
  usd: number | null;
  /** Companion Out instance for queued_in; companion In for queued_out. */
  outInstanceId: string | null;
  inInstanceId: string | null;
  pairIncomplete: boolean;
};

export type UnifiedWantRow = {
  key: string;
  displayName: string;
  totalQuantity: number;
  sources: WantSource[];
  minUsd: number | null;
  maxUsd: number | null;
};

export type SwimlaneId = 'swaps' | 'seeking' | 'queued_in' | 'queued_out';

export const SWIMLANE_LABELS: Record<SwimlaneId, string> = {
  swaps: 'Swaps',
  seeking: 'Seeking',
  queued_in: 'Queued In',
  queued_out: 'Out',
};

function normalizeMergeName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase();
}

/**
 * Merge key: prefer canonical instance `name` (oracle English when stored that way);
 * else normalized printing-sought label. Scryfall oracle_id is not yet on Hub oracles.
 */
export function wantMergeKey(
  card: CardInstance,
  printingSoughtName: string,
): string {
  const canonical = String(card.name || '').trim();
  if (canonical) return normalizeMergeName(canonical);
  return normalizeMergeName(printingSoughtName);
}

function printingSoughtName(deck: DeckDocument, card: CardInstance): string {
  const oracle = getOracle(deck, card);
  const view = resolveCardView(card, oracle);
  return cardDisplayName(view);
}

function quantityOf(card: CardInstance | undefined): number {
  const q = card?.quantity;
  return typeof q === 'number' && q > 0 ? q : 1;
}

export function isAcquireWantKind(kind: WantSourceKind): boolean {
  return kind === 'seeking' || kind === 'queued_in';
}

export function filterAcquireSources(sources: WantSource[]): WantSource[] {
  return (sources || []).filter((s) => isAcquireWantKind(s.kind));
}

export function partitionWantSourcesBySwimlane(
  sources: WantSource[],
): Record<SwimlaneId, WantSource[]> {
  const out: Record<SwimlaneId, WantSource[]> = {
    swaps: [],
    seeking: [],
    queued_in: [],
    queued_out: [],
  };
  for (const s of sources || []) {
    if (s.kind === 'seeking') out.seeking.push(s);
    else if (s.kind === 'queued_in') out.queued_in.push(s);
    else if (s.kind === 'queued_out') out.queued_out.push(s);
  }
  return out;
}

/**
 * Aggregate Queued In, Out, and Seeking across commander/cube decks.
 */
export function aggregateSwapWants(decks: DeckDocument[]): WantSource[] {
  const sources: WantSource[] = [];

  for (const deck of decks || []) {
    if (deck.format !== 'commander' && deck.format !== 'cube') continue;
    const byId = new Map((deck.cards || []).map((c) => [c.instanceId, c]));

    for (const entry of deck.formalSwapEntries || []) {
      const incomplete = !entry.inInstanceId || !entry.outInstanceId;

      if (entry.inInstanceId) {
        const card = byId.get(entry.inInstanceId);
        if (card) {
          const cardName = printingSoughtName(deck, card);
          sources.push({
            deckId: deck.deckId,
            deckName: deck.name,
            format: deck.format,
            kind: 'queued_in',
            entryId: entry.id,
            cardInstanceId: entry.inInstanceId,
            cardName,
            mergeKey: wantMergeKey(card, cardName),
            quantity: quantityOf(card),
            usd: null,
            outInstanceId: entry.outInstanceId ?? null,
            inInstanceId: entry.inInstanceId,
            pairIncomplete: incomplete,
          });
        }
      }

      if (entry.outInstanceId) {
        const card = byId.get(entry.outInstanceId);
        if (card) {
          const cardName = printingSoughtName(deck, card);
          sources.push({
            deckId: deck.deckId,
            deckName: deck.name,
            format: deck.format,
            kind: 'queued_out',
            entryId: entry.id,
            cardInstanceId: entry.outInstanceId,
            cardName,
            mergeKey: wantMergeKey(card, cardName),
            quantity: quantityOf(card),
            usd: null,
            outInstanceId: entry.outInstanceId,
            inInstanceId: entry.inInstanceId ?? null,
            pairIncomplete: incomplete,
          });
        }
      }
    }

    for (const entry of deck.lookingForEntries || []) {
      const card = byId.get(entry.instanceId);
      if (!card) continue;
      const cardName = printingSoughtName(deck, card);
      sources.push({
        deckId: deck.deckId,
        deckName: deck.name,
        format: deck.format,
        kind: 'seeking',
        entryId: entry.id,
        cardInstanceId: entry.instanceId,
        cardName,
        mergeKey: wantMergeKey(card, cardName),
        quantity: quantityOf(card),
        usd: null,
        outInstanceId: null,
        inInstanceId: null,
        pairIncomplete: false,
      });
    }
  }

  return sources;
}

function mostCommonOf(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  let best = names[0] || '';
  let bestCount = -1;
  for (const [name, count] of counts) {
    if (count > bestCount || (count === bestCount && name.localeCompare(best) < 0)) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function mostCommonName(sources: WantSource[]): string {
  return mostCommonOf(sources.map((s) => s.cardName));
}

/**
 * Unify want sources by mergeKey; displayName is printing-sought (most common, else first).
 */
export function unifyWantSources(sources: WantSource[]): UnifiedWantRow[] {
  const groups = new Map<string, WantSource[]>();
  for (const s of sources || []) {
    const list = groups.get(s.mergeKey) || [];
    list.push(s);
    groups.set(s.mergeKey, list);
  }

  const rows: UnifiedWantRow[] = [];
  for (const [key, group] of groups) {
    const usds = group.map((s) => s.usd).filter((u): u is number => u != null && Number.isFinite(u));
    rows.push({
      key,
      displayName: mostCommonName(group),
      totalQuantity: group.reduce((sum, s) => sum + s.quantity, 0),
      sources: group,
      minUsd: usds.length ? Math.min(...usds) : null,
      maxUsd: usds.length ? Math.max(...usds) : null,
    });
  }

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.key.localeCompare(b.key));
  return rows;
}

export type UnifiedCardRow = {
  key: string;
  displayName: string;
  totalQuantity: number;
  instanceIds: string[];
};

/**
 * Group all deck card instances by merge key (canonical name, or printing-sought
 * label when the canonical name is unavailable). Used by the Unified List browse view.
 */
export function unifyDeckCardInstances(deck: DeckDocument): UnifiedCardRow[] {
  const groups = new Map<string, { names: string[]; qty: number; ids: string[] }>();

  for (const card of deck.cards || []) {
    const name = printingSoughtName(deck, card);
    const key = wantMergeKey(card, name);
    const group = groups.get(key) || { names: [], qty: 0, ids: [] };
    group.names.push(name);
    group.qty += quantityOf(card);
    group.ids.push(card.instanceId);
    groups.set(key, group);
  }

  const rows: UnifiedCardRow[] = [];
  for (const [key, group] of groups) {
    rows.push({
      key,
      displayName: mostCommonOf(group.names),
      totalQuantity: group.qty,
      instanceIds: group.ids,
    });
  }

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.key.localeCompare(b.key));
  return rows;
}
