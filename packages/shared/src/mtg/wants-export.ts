import { cardMatchesSetMembership } from '../deck-builder/scryfall-api.js';
import type { FormalSwapEntry } from '../schemas/deck-builder.js';
import { unifyWantSources, type WantSource } from './wants-aggregate.js';

// Re-export for callers that filter decks/swaps with the same membership set.
export { cardMatchesSetMembership } from '../deck-builder/scryfall-api.js';

export type WantsPriceFilter = {
  /** null = filter off */
  minUsd: number | null;
  /** null or empty = filter off (show all decks) */
  deckIds?: string[] | null;
  /**
   * Scryfall set membership (`in:` ∪ `set:` normalized card names). null/empty = filter off.
   * Pair filtering uses {@link filterWantSources} either-side rule for queued faces.
   */
  setMembership?: ReadonlySet<string> | null;
};

/**
 * Price filter: missing USD always passes (proxy targets). When minUsd set, priced cards must be >= min.
 */
export function passesPriceFilter(source: WantSource, filter: WantsPriceFilter): boolean {
  if (filter.minUsd == null) return true;
  if (source.usd == null) return true;
  return source.usd >= filter.minUsd;
}

/**
 * Deck filter: null/empty deckIds = off. When set, only matching deckId passes.
 */
export function passesDeckFilter(source: WantSource, filter: WantsPriceFilter): boolean {
  const ids = filter.deckIds;
  if (ids == null || ids.length === 0) return true;
  return ids.includes(source.deckId);
}

/**
 * Set membership for a single want face. Off when membership null/empty.
 * Prefer mergeKey (normalized), fall back to cardName.
 */
export function passesSetFilter(
  source: WantSource,
  membership: ReadonlySet<string> | null | undefined,
): boolean {
  if (membership == null || membership.size === 0) return true;
  if (cardMatchesSetMembership(source.mergeKey, membership)) return true;
  return cardMatchesSetMembership(source.cardName, membership);
}

function passesBaseFilters(source: WantSource, filter: WantsPriceFilter): boolean {
  return passesPriceFilter(source, filter) && passesDeckFilter(source, filter);
}

function pairKey(source: WantSource): string {
  return `${source.deckId}:${source.entryId}`;
}

/**
 * Filter wants by price/deck, then by Scryfall set membership (`in:` ∪ `set:`).
 * For queued_in/queued_out pairs, keep **both** sides when either face matches.
 * Seeking rows must match individually.
 */
export function filterWantSources(
  sources: WantSource[],
  filter: WantsPriceFilter,
): WantSource[] {
  const base = (sources || []).filter((s) => passesBaseFilters(s, filter));
  const membership = filter.setMembership;
  if (membership == null || membership.size === 0) return base;

  const keepKeys = new Set<string>();
  for (const s of base) {
    if (s.kind === 'seeking') {
      if (passesSetFilter(s, membership)) keepKeys.add(`seeking:${pairKey(s)}`);
      continue;
    }
    if (s.kind !== 'queued_in' && s.kind !== 'queued_out') continue;
    if (passesSetFilter(s, membership)) keepKeys.add(`pair:${pairKey(s)}`);
  }

  return base.filter((s) => {
    if (s.kind === 'seeking') return keepKeys.has(`seeking:${pairKey(s)}`);
    if (s.kind === 'queued_in' || s.kind === 'queued_out') {
      return keepKeys.has(`pair:${pairKey(s)}`);
    }
    return false;
  });
}

/** Alias matching the plan name; same implementation as {@link filterWantSources}. */
export const filterWantSourcesWithPairSetRule = filterWantSources;

/**
 * Formal swap pair matches when either In or Out name is in membership (or filter off).
 */
export function formalSwapMatchesSetMembership(
  entry: Pick<FormalSwapEntry, 'inInstanceId' | 'outInstanceId'>,
  resolveName: (instanceId: string | null) => string | null | undefined,
  membership: ReadonlySet<string> | null | undefined,
): boolean {
  if (membership == null || membership.size === 0) return true;
  const inName = resolveName(entry.inInstanceId ?? null);
  const outName = resolveName(entry.outInstanceId ?? null);
  if (inName && cardMatchesSetMembership(inName, membership)) return true;
  if (outName && cardMatchesSetMembership(outName, membership)) return true;
  return false;
}

function exportLines(sources: WantSource[]): string[] {
  const rows = unifyWantSources(sources);
  return rows.map((r) => `${r.totalQuantity} ${r.displayName}`);
}

/** Combined qty / printing-sought name lines (shopping / Archidekt paste). */
export function buildArchidektWantsText(sources: WantSource[]): string {
  const lines = exportLines(sources);
  if (!lines.length) return '';
  return ['// Seeking / Queued In (combined)', ...lines].join('\n') + '\n';
}

/** Same combined lines without section header. */
export function buildNameQtyWantsText(sources: WantSource[]): string {
  const lines = exportLines(sources);
  if (!lines.length) return '';
  return lines.join('\n') + '\n';
}
