import type { DeckSummary } from '@rayenz-hub/shared';
import { isApiConfigured } from '../../api/hub-api';
import { isSampleDeckId } from '../sample/sample-deck';
import { apiGetDeck, apiListDecks } from './deck-api';
import { getDeck, listDecks, mergeDeckDocuments, saveDeck } from './deck-store';

/**
 * Pull Hub API library updates into IndexedDB when API is configured.
 * Returns the merged local summary list. Throws if a configured API call fails.
 */
export async function pullRemoteLibraryUpdates(): Promise<DeckSummary[]> {
  let list = await listDecks();
  if (!isApiConfigured()) return list;

  const remote = await apiListDecks();
  const byId = new Map(list.map((d) => [d.deckId, d]));
  for (const r of remote) {
    if (isSampleDeckId(r.deckId)) continue;
    const local = byId.get(r.deckId);
    if (!local || r.updatedAt >= local.updatedAt) {
      byId.set(r.deckId, {
        ...r,
        coverImageUrl: r.coverImageUrl || local?.coverImageUrl || null,
        coverImageUrlSecondary: r.coverImageUrlSecondary || local?.coverImageUrlSecondary || null,
        coverPartnerStatus: r.coverPartnerStatus ?? local?.coverPartnerStatus ?? null,
      });
      const full = await apiGetDeck(r.deckId);
      if (full && !isSampleDeckId(full.deckId)) {
        const merged = mergeDeckDocuments(await getDeck(r.deckId), full);
        if (merged) await saveDeck(merged);
      }
    }
  }
  list = [...byId.values()].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name),
  );
  return list;
}
