import {
  aggregateSwapWants,
  type DeckDocument,
  type DeckSummary,
  type WantSource,
} from '@rayenz-hub/shared';
import { apiGetPublicSwaps } from '../deck-builder/store/deck-api';
import { listFallbackLibrary, resolveLibraryDocument } from '../deck-builder/store/library-sync';

async function documentsForSummaries(summaries: DeckSummary[]): Promise<DeckDocument[]> {
  const decks: DeckDocument[] = [];
  for (const s of summaries) {
    if (s.format !== 'commander' && s.format !== 'cube') continue;
    const doc = await resolveLibraryDocument(s.deckId);
    if (doc) decks.push(doc);
  }
  return decks;
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
