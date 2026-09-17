import {
  aggregateSwapWants,
  aggregateTheorySeekingWants,
  isSwapAggregateSummary,
  isTheoryDeck,
  mapPool,
  SWAP_AGGREGATE_GET_CONCURRENCY,
  type DeckDocument,
  type DeckSummary,
  type WantSource,
} from '@rayenz-hub/shared';
import { apiGetPublicSwaps } from '../deck-builder/store/deck-api';
import { listFallbackLibrary, resolveLibraryDocument } from '../deck-builder/store/library-sync';

/** Load deck docs that may contribute to swap aggregation (concurrent, skip known-empty). */
export async function documentsForSummaries(summaries: DeckSummary[]): Promise<DeckDocument[]> {
  const candidates = (summaries || []).filter(isSwapAggregateSummary);
  const loaded = await mapPool(candidates, SWAP_AGGREGATE_GET_CONCURRENCY, async (s) =>
    resolveLibraryDocument(s.deckId),
  );
  return loaded.filter((doc): doc is DeckDocument => doc != null);
}

function isTheorySwapFormat(summary: Pick<DeckSummary, 'format'>): boolean {
  return (
    summary.format === 'commander' ||
    summary.format === 'cube' ||
    summary.format === 'pendragon'
  );
}

/** Theory commander/cube/pendragon summaries eligible for opt-in Seeking on Swap Queue. */
export function theorySwapSummaries(summaries: DeckSummary[]): DeckSummary[] {
  return (summaries || [])
    .filter((s) => isTheoryDeck(s) && isTheorySwapFormat(s))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Load selected theory decks and aggregate Seeking-only wants. */
export async function loadTheorySeekingSources(
  summaries: DeckSummary[],
  selectedIds: string[],
): Promise<{ decks: DeckDocument[]; sources: WantSource[] }> {
  const idSet = new Set(selectedIds || []);
  if (!idSet.size) return { decks: [], sources: [] };
  const candidates = theorySwapSummaries(summaries).filter((s) => idSet.has(s.deckId));
  const loaded = await mapPool(candidates, SWAP_AGGREGATE_GET_CONCURRENCY, async (s) =>
    resolveLibraryDocument(s.deckId),
  );
  const decks = loaded.filter((doc): doc is DeckDocument => doc != null && isTheoryDeck(doc));
  return { decks, sources: aggregateTheorySeekingWants(decks) };
}

/** Load commander + cube decks from the Hub library and aggregate want sources. */
export async function loadSwapWantSources(summaries?: DeckSummary[]): Promise<{
  decks: DeckDocument[];
  sources: WantSource[];
}> {
  const list = summaries ?? (await listFallbackLibrary());
  const decks = await documentsForSummaries(list);
  return { decks, sources: aggregateSwapWants(decks) };
}

/** Load another user's public swap queue (unauthenticated). */
export async function loadPublicSwapWantSources(username: string): Promise<{
  username: string;
  slug: string;
  decks: DeckDocument[];
  sources: WantSource[];
} | null> {
  const payload = await apiGetPublicSwaps(username);
  if (!payload) return null;
  return {
    username: payload.username,
    slug: payload.slug,
    decks: payload.decks,
    sources: aggregateSwapWants(payload.decks),
  };
}

export function findDeck(decks: DeckDocument[], deckId: string): DeckDocument | null {
  return decks.find((d) => d.deckId === deckId) || null;
}

/** Merge owned aggregate with opt-in theory Seeking (theory docs replace by id). */
export function mergeOwnedAndTheorySources(
  ownedDecks: DeckDocument[],
  ownedSources: WantSource[],
  theoryDecks: DeckDocument[],
  theorySources: WantSource[],
): { decks: DeckDocument[]; sources: WantSource[] } {
  const byId = new Map(ownedDecks.map((d) => [d.deckId, d]));
  for (const d of theoryDecks) byId.set(d.deckId, d);
  return {
    decks: [...byId.values()],
    sources: [...ownedSources, ...theorySources],
  };
}
