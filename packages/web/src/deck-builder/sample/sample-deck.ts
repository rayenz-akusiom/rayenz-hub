import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import * as store from '../store/deck-store';
import {
  SAMPLE_COMMANDER_DECK_ID,
  SAMPLE_COMMANDER_DECK_NAME,
  buildSampleCommanderDocument,
  getSampleCommanderSummary,
  sampleMainDeckCardCount,
} from './sample-commander-deck';

export {
  SAMPLE_COMMANDER_DECK_ID,
  SAMPLE_COMMANDER_DECK_NAME,
  buildSampleCommanderDocument,
  getSampleCommanderSummary,
  sampleMainDeckCardCount,
};

export const SAMPLE_DISMISS_KEY = 'rayenz-deck-builder-sample-dismissed';

export function isSampleDeckId(deckId: string | null | undefined): boolean {
  return deckId === SAMPLE_COMMANDER_DECK_ID;
}

export function isSampleDismissed(): boolean {
  try {
    return localStorage.getItem(SAMPLE_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissSampleDeck(): void {
  try {
    localStorage.setItem(SAMPLE_DISMISS_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

/** Whether the Commander library should offer the sample (no real commander decks, not dismissed). */
export function shouldOfferSampleCommander(realCommanderDecks: DeckSummary[]): boolean {
  return realCommanderDecks.length === 0 && !isSampleDismissed();
}

/**
 * Ensure the sample document exists in local storage when offered.
 * Does not overwrite an already-edited sample.
 */
export async function ensureSampleDeck(): Promise<DeckDocument | null> {
  if (isSampleDismissed()) return null;
  const existing = await store.getDeck(SAMPLE_COMMANDER_DECK_ID);
  if (existing) return existing;
  return store.saveDeck(buildSampleCommanderDocument());
}
