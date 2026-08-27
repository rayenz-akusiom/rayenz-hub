import { cardMatchesNameMembership, cardMatchesSetMembership } from '../deck-builder/scryfall-api.js';
import { categoryIncluded } from '../deck-builder/browse.js';
import { isSeekingCategory, isSwapQueueCategoryName } from '../mtg/swap-queue.js';
import type { DeckDocument, FormalSwapEntry } from '../schemas/deck-builder.js';
import { unifyWantSources, type WantSource } from './wants-aggregate.js';

// Re-export for callers that filter decks/swaps with the same membership set.
export { cardMatchesSetMembership } from '../deck-builder/scryfall-api.js';

export type WantsPriceFilter = {
  /** null = filter off. Compared against WantSource.usd (Scryfall USD). */
  minUsd: number | null;
  /** null = filter off. Compared against WantSource.usd (Scryfall USD). */
  maxUsd?: number | null;
  /** null or empty = filter off (show all decks) */
  deckIds?: string[] | null;
  /**
   * Scryfall set membership (`in:` ∪ `set:` normalized card names). null/empty = filter off.
   * Pair filtering uses {@link filterWantSources} either-side rule for queued faces.
   */
  setMembership?: ReadonlySet<string> | null;
  /**
   * Exclude set membership. null/empty = filter off.
   * Pairs drop when the acquire face (Queued In) matches; Seeking drops individually.
   * Incomplete Out-only pairs drop when Out matches.
   */
  setExcludeMembership?: ReadonlySet<string> | null;
  /**
   * Scryfall syntax membership (normalized card names). null/empty = filter off.
   * Pair filtering uses the same either-side rule as {@link setMembership}.
   */
  syntaxMembership?: ReadonlySet<string> | null;
  /** When true, keep only wants whose deck card is in the counted main deck. */
  mainDeckOnly?: boolean;
};

export type WantsFilterContext = {
  deckById?: ReadonlyMap<string, DeckDocument>;
};

/** True when the want's deck card is in an included main-deck category (not aside / swap pair). */
export function isMainDeckWantSource(source: WantSource, deck: DeckDocument): boolean {
  if (source.kind === 'queued_in' || source.kind === 'queued_out') return false;
  const card = (deck.cards || []).find((c) => c.instanceId === source.cardInstanceId);
  if (!card) return false;
  const primary = card.primaryCategory || 'Other';
  if (primary === 'Maybeboard') return false;
  if (isSeekingCategory(primary)) return false;
  if (isSwapQueueCategoryName(primary)) return false;
  if (!categoryIncluded(deck.categories || [], primary)) return false;
  return true;
}

/**
 * Price filter: missing USD always passes (proxy targets).
 * When minUsd set, priced cards must be >= min.
 * When maxUsd set, priced cards must be <= max.
 */
export function passesPriceFilter(source: WantSource, filter: WantsPriceFilter): boolean {
  if (source.usd == null) return true;
  if (filter.minUsd != null && source.usd < filter.minUsd) return false;
  if (filter.maxUsd != null && source.usd > filter.maxUsd) return false;
  return true;
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

/** True when the face name is in the syntax membership set. Null = off; empty = no matches. */
export function passesSyntaxFilter(
  source: WantSource,
  membership: ReadonlySet<string> | null | undefined,
): boolean {
  if (membership == null) return true;
  if (cardMatchesNameMembership(source.mergeKey, membership)) return true;
  return cardMatchesNameMembership(source.cardName, membership);
}

export function matchesSetExclude(
  source: WantSource,
  exclude: ReadonlySet<string> | null | undefined,
): boolean {
  if (exclude == null || exclude.size === 0) return false;
  if (cardMatchesSetMembership(source.mergeKey, exclude)) return true;
  return cardMatchesSetMembership(source.cardName, exclude);
}

function passesBaseFilters(source: WantSource, filter: WantsPriceFilter): boolean {
  return passesPriceFilter(source, filter) && passesDeckFilter(source, filter);
}

function pairKey(source: WantSource): string {
  return `${source.deckId}:${source.entryId}`;
}

/**
 * Filter wants by price/deck, then by Scryfall set include/exclude and syntax.
 * Include / syntax: for queued_in/queued_out pairs, keep **both** sides when either face matches.
 * Seeking rows must match include and syntax individually.
 * Exclude: drop pairs when the acquire face (queued_in) matches; if no In, apply to Out.
 * Seeking drops when the face matches exclude.
 */
export function filterWantSources(
  sources: WantSource[],
  filter: WantsPriceFilter,
  context?: WantsFilterContext,
): WantSource[] {
  const base = (sources || []).filter((s) => passesBaseFilters(s, filter));
  const membership = filter.setMembership;
  const exclude = filter.setExcludeMembership;
  const syntax = filter.syntaxMembership;
  const includeOn = membership != null && membership.size > 0;
  const excludeOn = exclude != null && exclude.size > 0;
  const syntaxOn = syntax != null;
  if (!includeOn && !excludeOn && !syntaxOn) {
    return applyMainDeckOnlyFilter(base, filter, context);
  }

  const keepKeys = new Set<string>();
  const pairSides = new Map<string, { in?: WantSource; out?: WantSource }>();

  for (const s of base) {
    if (s.kind === 'seeking') {
      const seekingKey = `seeking:${pairKey(s)}`;
      if (includeOn && !passesSetFilter(s, membership)) continue;
      if (syntaxOn && !passesSyntaxFilter(s, syntax)) continue;
      if (excludeOn && matchesSetExclude(s, exclude)) continue;
      keepKeys.add(seekingKey);
      continue;
    }
    if (s.kind !== 'queued_in' && s.kind !== 'queued_out') continue;
    const key = pairKey(s);
    let sides = pairSides.get(key);
    if (!sides) {
      sides = {};
      pairSides.set(key, sides);
    }
    if (s.kind === 'queued_in') sides.in = s;
    else sides.out = s;
  }

  for (const [key, sides] of pairSides) {
    const faces = [sides.in, sides.out].filter(Boolean) as WantSource[];
    if (!faces.length) continue;

    if (includeOn) {
      const eitherMatches = faces.some((f) => passesSetFilter(f, membership));
      if (!eitherMatches) continue;
    }

    if (syntaxOn) {
      const eitherMatches = faces.some((f) => passesSyntaxFilter(f, syntax));
      if (!eitherMatches) continue;
    }

    if (excludeOn) {
      const acquire = sides.in ?? sides.out;
      if (acquire && matchesSetExclude(acquire, exclude)) continue;
    }

    keepKeys.add(`pair:${key}`);
  }

  return applyMainDeckOnlyFilter(
    base.filter((s) => {
      if (s.kind === 'seeking') return keepKeys.has(`seeking:${pairKey(s)}`);
      if (s.kind === 'queued_in' || s.kind === 'queued_out') {
        return keepKeys.has(`pair:${pairKey(s)}`);
      }
      return false;
    }),
    filter,
    context,
  );
}

function applyMainDeckOnlyFilter(
  sources: WantSource[],
  filter: WantsPriceFilter,
  context?: WantsFilterContext,
): WantSource[] {
  if (!filter.mainDeckOnly || !context?.deckById?.size) return sources;
  return sources.filter((s) => {
    const deck = context.deckById!.get(s.deckId);
    if (!deck) return false;
    return isMainDeckWantSource(s, deck);
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
