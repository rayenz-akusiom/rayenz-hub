import {
  sortSuggestions,
  validatePayload,
  type DeckEntry,
  type Suggestion,
  type SuggestionsPayload,
} from '@rayenz-hub/shared';
import {
  fileIdFromMeta,
  hydrateReviewProgressFromApi,
  loadReviewProgress,
  saveReviewProgress,
  type ReviewProgress,
} from '../lib/hub-storage';
import { handoffSnapshotSummary } from '../lib/hub-utils';
import { getDecision } from './decisions';
import { getDeckPreferences, isSuggestionFiltered } from './profiles';
import type { DeckPrefs, DeckReviewState, TransferSource } from './types';

export { validatePayload as validateSuggestions, sortSuggestions };

export function getDeckById(data: SuggestionsPayload | null, deckId: string | null): DeckEntry | null {
  if (!data || !deckId) {
    return null;
  }
  return data.decks.find((d) => d.deck_id === deckId) || null;
}

export function deckProgressCounts(
  deck: DeckEntry,
  progress: ReviewProgress,
): { total: number; reviewed: number; accepted: number } {
  const total = (deck.suggestions || []).length;
  let reviewed = 0;
  let accepted = 0;
  (deck.suggestions || []).forEach((s) => {
    const d = getDecision(progress, String(s.suggestion_id));
    if (d) {
      reviewed++;
      if (d.status === 'accepted') {
        accepted++;
      }
    }
  });
  return { total, reviewed, accepted };
}

export function allVisibleSuggestions(
  deck: DeckEntry,
  deckPrefs: Record<string, DeckPrefs>,
): Suggestion[] {
  const prefs = getDeckPreferences(deck, deckPrefs);
  return sortSuggestions(deck.suggestions || []).filter((s) => !isSuggestionFiltered(s, prefs));
}

export function pendingSuggestions(
  deck: DeckEntry,
  progress: ReviewProgress,
  deckPrefs: Record<string, DeckPrefs>,
): Suggestion[] {
  const prefs = getDeckPreferences(deck, deckPrefs);
  return sortSuggestions(deck.suggestions || []).filter((s) => {
    const d = getDecision(progress, String(s.suggestion_id));
    if (d && d.status !== 'skipped') {
      return false;
    }
    return !isSuggestionFiltered(s, prefs);
  });
}

export function currentSuggestion(
  deck: DeckEntry,
  progress: ReviewProgress,
  deckPrefs: Record<string, DeckPrefs>,
  suggestionIndex: number,
): Suggestion | null {
  const pending = pendingSuggestions(deck, progress, deckPrefs);
  if (!pending.length) {
    return null;
  }
  const idx = Math.min(suggestionIndex, pending.length - 1);
  return pending[idx];
}

export function deckSuggestionCount(deck: DeckEntry): number {
  return (deck.suggestions || []).length;
}

export function sortDecksByName(decks: DeckEntry[]): DeckEntry[] {
  return decks.slice().sort((a, b) =>
    String(a.deck_name || a.deck_id).localeCompare(String(b.deck_name || b.deck_id)),
  );
}

export function handoffSnapshotDate(data: SuggestionsPayload): string | null {
  const dates = (data.decks || [])
    .map((d) => d.deck_snapshot?.fetched_at)
    .filter(Boolean) as string[];
  if (!dates.length) {
    return null;
  }
  dates.sort();
  return dates[dates.length - 1];
}

export function createInitialReviewState(): DeckReviewState {
  return {
    data: null,
    fileId: null,
    progress: { decisions: {}, currentDeckId: null, currentSuggestionIndex: {} },
    activeDeckId: null,
    suggestionIndex: 0,
    deckPrefs: {},
    profileStatus: '',
    profilesConnected: false,
    showAllMode: false,
    statusCardTab: 'decisions',
    transferSource: null,
  };
}

export function applyLoadedSuggestions(
  state: DeckReviewState,
  data: SuggestionsPayload,
  progress: ReviewProgress,
): DeckReviewState {
  const validated = validatePayload(data);
  const fileId = fileIdFromMeta(validated.meta);
  const nextProgress = progress || loadReviewProgress(fileId);
  if (!nextProgress.currentSuggestionIndex) {
    nextProgress.currentSuggestionIndex = {};
  }
  const activeDeckId = nextProgress.currentDeckId || validated.decks[0]?.deck_id || null;
  const suggestionIndex = activeDeckId
    ? nextProgress.currentSuggestionIndex[activeDeckId] || 0
    : 0;
  return {
    ...state,
    data: validated,
    fileId,
    progress: nextProgress,
    activeDeckId,
    suggestionIndex,
  };
}

export async function loadSuggestionsData(
  state: DeckReviewState,
  data: SuggestionsPayload,
  transferSource?: TransferSource,
): Promise<DeckReviewState> {
  const validated = validatePayload(data);
  const fileId = fileIdFromMeta(validated.meta);
  const progress = await hydrateReviewProgressFromApi(fileId);
  let next = applyLoadedSuggestions(state, validated, progress);
  if (transferSource) {
    next = { ...next, transferSource };
  }
  return next;
}

export function handoffStatusMessage(data: SuggestionsPayload, transferSource: TransferSource): string | null {
  if (transferSource !== 'deck-suggest') {
    return null;
  }
  const summary = handoffSnapshotSummary(data);
  if (summary.missingSnapshots > 0) {
    return summary.missingSnapshots + ' deck(s) missing snapshots — use Refresh from Archidekt (optional) or return to Deck Suggest.';
  }
  if (summary.allReady) {
    return 'Ready to review — deck snapshots included from Deck Suggest.';
  }
  return null;
}

export function setDecisionOnProgress(
  progress: ReviewProgress,
  fileId: string,
  suggestionId: string,
  decision: unknown,
): ReviewProgress {
  const next = {
    ...progress,
    decisions: { ...progress.decisions, [suggestionId]: decision },
  };
  saveReviewProgress(fileId, next);
  return next;
}

export function recordDecision(
  state: DeckReviewState,
  suggestionId: string,
  decision: unknown,
  advanceOnAction: boolean,
): DeckReviewState {
  if (!state.fileId || !state.activeDeckId) {
    return state;
  }
  const progress = setDecisionOnProgress(state.progress, state.fileId, suggestionId, decision);
  if (advanceOnAction) {
    const suggestionIndex = state.suggestionIndex + 1;
    progress.currentSuggestionIndex = {
      ...progress.currentSuggestionIndex,
      [state.activeDeckId]: suggestionIndex,
    };
    saveReviewProgress(state.fileId, progress);
    return { ...state, progress, suggestionIndex };
  }
  return { ...state, progress };
}

export function selectDeck(state: DeckReviewState, deckId: string): DeckReviewState {
  if (!state.fileId) {
    return { ...state, activeDeckId: deckId };
  }
  const suggestionIndex = state.progress.currentSuggestionIndex[deckId] || 0;
  const progress = {
    ...state.progress,
    currentDeckId: deckId,
  };
  saveReviewProgress(state.fileId, progress);
  return { ...state, activeDeckId: deckId, suggestionIndex, progress };
}

export function showDownloadJson(transferSource: TransferSource): boolean {
  return transferSource === 'deck-suggest';
}

export function refreshAllDecksLabel(transferSource: TransferSource): string {
  return transferSource === 'deck-suggest' ? 'Refresh from Archidekt (optional)' : 'Refresh all decks';
}

export function refreshAllDecksTitle(bridgeOk: boolean, transferSource: TransferSource): string {
  if (transferSource === 'deck-suggest') {
    return bridgeOk
      ? 'Snapshots loaded from Deck Suggest; refresh only if Archidekt changed since.'
      : 'Requires Archidekt Deck Review Bridge userscript';
  }
  return bridgeOk ? 'Fetch latest deck lists from Archidekt' : 'Requires Archidekt Deck Review Bridge userscript';
}
