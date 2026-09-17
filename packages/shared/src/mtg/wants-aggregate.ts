import {
  isTheoryDeck,
  type CardInstance,
  type CardOracle,
  type DeckDocument,
  type DeckSummary,
} from '../schemas/deck-builder.js';
import { cardDisplayName, getOracle, oracleKey, resolveCardView } from '../deck-builder/card-oracle.js';

/** Bounded concurrency for multi-deck swap document loads. */
export const SWAP_AGGREGATE_GET_CONCURRENCY = 12;

/**
 * Summaries that may contribute to library-wide swap aggregation.
 * Missing `hasSwapEntries` (legacy) still loads; explicit false skips.
 */
export function isSwapAggregateSummary(
  summary: Pick<DeckSummary, 'format' | 'ownership' | 'hasSwapEntries'>,
): boolean {
  if (
    summary.format !== 'commander' &&
    summary.format !== 'cube' &&
    summary.format !== 'pendragon'
  ) {
    return false;
  }
  if (isTheoryDeck(summary)) return false;
  if (summary.hasSwapEntries === false) return false;
  return true;
}

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
  /** Printing identity for Scryfall price enrich (null when unknown). */
  setCode: string | null;
  collectorNumber: string | null;
  foil: boolean;
  /** Companion Out instance for queued_in; companion In for queued_out. */
  outInstanceId: string | null;
  inInstanceId: string | null;
  pairIncomplete: boolean;
};

function printingFields(card: CardInstance): Pick<WantSource, 'setCode' | 'collectorNumber' | 'foil'> {
  return {
    setCode: card.setCode?.trim() || null,
    collectorNumber: card.collectorNumber?.trim() || null,
    foil: Boolean(card.foil),
  };
}

export type UnifiedWantRow = {
  key: string;
  displayName: string;
  totalQuantity: number;
  sources: WantSource[];
  minUsd: number | null;
  maxUsd: number | null;
};

export type SwimlaneId = 'swaps' | 'seeking' | 'queued_in' | 'queued_out' | 'theory';

export const SWIMLANE_LABELS: Record<SwimlaneId, string> = {
  swaps: 'Swaps',
  seeking: 'Seeking',
  queued_in: 'Queued In',
  queued_out: 'Out',
  theory: 'Theory',
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
  opts?: { theoryDeckIds?: ReadonlySet<string> | string[] },
): Record<SwimlaneId, WantSource[]> {
  const theoryIds =
    opts?.theoryDeckIds instanceof Set
      ? opts.theoryDeckIds
      : new Set(opts?.theoryDeckIds || []);
  const out: Record<SwimlaneId, WantSource[]> = {
    swaps: [],
    seeking: [],
    queued_in: [],
    queued_out: [],
    theory: [],
  };
  for (const s of sources || []) {
    if (s.kind === 'seeking') {
      if (theoryIds.has(s.deckId)) out.theory.push(s);
      else out.seeking.push(s);
    } else if (s.kind === 'queued_in') out.queued_in.push(s);
    else if (s.kind === 'queued_out') out.queued_out.push(s);
  }
  return out;
}

function pushSeekingSources(deck: DeckDocument, byId: Map<string, CardInstance>, sources: WantSource[]) {
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
      ...printingFields(card),
      outInstanceId: null,
      inInstanceId: null,
      pairIncomplete: false,
    });
  }
}

function isSwapAggregateFormat(format: DeckDocument['format']): boolean {
  return format === 'commander' || format === 'cube' || format === 'pendragon';
}

/**
 * Aggregate Queued In, Out, and Seeking across commander/cube decks.
 */
export function aggregateSwapWants(decks: DeckDocument[]): WantSource[] {
  const sources: WantSource[] = [];

  for (const deck of decks || []) {
    if (!isSwapAggregateFormat(deck.format)) continue;
    // Theory decks are speculative — queues are not acquire/trade intent by default.
    if (isTheoryDeck(deck)) continue;
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
            ...printingFields(card),
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
            ...printingFields(card),
            outInstanceId: entry.outInstanceId,
            inInstanceId: entry.inInstanceId ?? null,
            pairIncomplete: incomplete,
          });
        }
      }
    }

    pushSeekingSources(deck, byId, sources);
  }

  return sources;
}

/**
 * Opt-in Seeking rows from theory decks (formal In/Out ignored).
 * Callers choose which theory docs to pass; default library aggregate skips theory.
 */
export function aggregateTheorySeekingWants(decks: DeckDocument[]): WantSource[] {
  const sources: WantSource[] = [];
  for (const deck of decks || []) {
    if (!isSwapAggregateFormat(deck.format)) continue;
    if (!isTheoryDeck(deck)) continue;
    const byId = new Map((deck.cards || []).map((c) => [c.instanceId, c]));
    pushSeekingSources(deck, byId, sources);
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

function queueInstanceIds(deck: DeckDocument): Set<string> {
  const ids = new Set<string>();
  for (const entry of deck.formalSwapEntries || []) {
    if (entry.inInstanceId) ids.add(entry.inInstanceId);
    if (entry.outInstanceId) ids.add(entry.outInstanceId);
  }
  for (const entry of deck.lookingForEntries || []) {
    if (entry.instanceId) ids.add(entry.instanceId);
  }
  return ids;
}

/** Strip a deck down to swap-queue cards and matching oracles for public share payloads. */
export function redactDeckForPublicSwaps(deck: DeckDocument): DeckDocument {
  const keepIds = queueInstanceIds(deck);
  const cards = (deck.cards || []).filter((c) => keepIds.has(c.instanceId));
  const oracle: Record<string, CardOracle> = {};
  for (const card of cards) {
    const key = oracleKey(card);
    const entry = deck.oracle?.[key];
    if (entry) oracle[key] = entry;
  }
  return {
    ...deck,
    cards,
    oracle,
  };
}
