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
        // Keep local ownership when the list projection omits / defaults it (older API).
        ownership:
          r.ownership === 'theory' || r.ownership === 'owned'
            ? r.ownership
            : local?.ownership === 'theory'
              ? 'theory'
              : 'owned',
        coverImageUrl: r.coverImageUrl || local?.coverImageUrl || null,
        coverImageUrlSecondary: r.coverImageUrlSecondary || local?.coverImageUrlSecondary || null,
        coverPartnerStatus: r.coverPartnerStatus ?? local?.coverPartnerStatus ?? null,
      });
      const full = await apiGetDeck(r.deckId);
      if (full && !isSampleDeckId(full.deckId)) {
        const prior = await getDeck(r.deckId);
        const merged = mergeDeckDocuments(prior, full);
        if (merged) {
          // Prefer local theory when remote doc defaulted to owned after a strip.
          const withOwnership =
            prior?.ownership === 'theory' && merged.ownership !== 'theory'
              ? { ...merged, ownership: 'theory' as const }
              : merged;
          await saveDeck(withOwnership);
        }
      }
    }
  }
  // Re-read local index after merges — do not return remote list projections
  // (they can omit ownership and wipe Theory swimlanes in the UI).
  return listDecks();
}
