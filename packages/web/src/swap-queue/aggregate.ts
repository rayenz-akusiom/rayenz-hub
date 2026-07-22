import {
  aggregateSwapWants,
  type DeckDocument,
  type WantSource,
} from '@rayenz-hub/shared';
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

export function findDeck(decks: DeckDocument[], deckId: string): DeckDocument | null {
  return decks.find((d) => d.deckId === deckId) || null;
}
