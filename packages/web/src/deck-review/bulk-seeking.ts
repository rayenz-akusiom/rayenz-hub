import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { persistAcceptedSuggestion } from '../deck-suggest/accept';
import { buildAcceptedSeeking } from './decisions';
import type { AcceptedSwap } from './types';

export type BulkSeekingResult = {
  accepted: number;
  failed: Array<{ suggestionId: string; error: string }>;
};

/**
 * Accept every pending suggestion as Seeking using the suggested In printing defaults.
 * Persists sequentially to avoid racing Hub deck patches.
 */
export async function acceptAllPendingAsSeeking(
  deck: DeckEntry,
  pending: Suggestion[],
  options?: {
    persist?: typeof persistAcceptedSuggestion;
    onAccepted?: (suggestionId: string, accepted: AcceptedSwap) => void;
  },
): Promise<BulkSeekingResult> {
  const persist = options?.persist ?? persistAcceptedSuggestion;
  const failed: BulkSeekingResult['failed'] = [];
  let accepted = 0;

  for (const suggestion of pending) {
    const suggestionId = String(suggestion.suggestion_id);
    const card = suggestion.card as { scryfall_id?: string };
    const built = buildAcceptedSeeking(deck, suggestion, {
      printId: card.scryfall_id || '',
      finish: 'nonfoil',
      prints: [],
    });
    if ('error' in built) {
      failed.push({ suggestionId, error: built.error });
      continue;
    }
    try {
      await persist(suggestion as Parameters<typeof persistAcceptedSuggestion>[0], built);
      options?.onAccepted?.(suggestionId, built);
      accepted += 1;
    } catch (err) {
      failed.push({
        suggestionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { accepted, failed };
}
