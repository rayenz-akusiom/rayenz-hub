import {
  aggregateSwapWants,
  type DeckDocument,
  type WantSource,
} from '@rayenz-hub/shared';
import { apiGetPublicSwaps } from '../deck-builder/store/deck-api';
import { getDeck, listDecks } from '../deck-builder/store/deck-store';

/** Load commander + cube decks from the Hub library and aggregate want sources. */
export async function loadSwapWantSources(): Promise<{
  decks: DeckDocument[];
  sources: WantSource[];
}> {
  const summaries = await listDecks();
  const decks: DeckDocument[] = [];
  for (const s of summaries) {
    if (s.format !== 'commander' && s.format !== 'cube') continue;
    const doc = await getDeck(s.deckId);
    if (doc) decks.push(doc);
  }
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
