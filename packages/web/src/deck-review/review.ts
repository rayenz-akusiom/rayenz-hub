import {
  markLozengesExisting,
  plusLozengesToProfileUpdates,
  sortSuggestions,
  validatePayload,
  type DeckEntry,
  type ProfileLozenge,
  type ProfileLozengeUpdates,
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

function filterByScope(suggestions: Suggestion[], scopeSuggestionIds?: readonly string[] | null): Suggestion[] {
  if (!scopeSuggestionIds?.length) {
    return suggestions;
  }
  const scope = new Set(scopeSuggestionIds.map(String));
  return suggestions.filter((s) => scope.has(String(s.suggestion_id)));
}

export function allVisibleSuggestions(
  deck: DeckEntry,
  deckPrefs: Record<string, DeckPrefs>,
  scopeSuggestionIds?: readonly string[] | null,
): Suggestion[] {
  const prefs = getDeckPreferences(deck, deckPrefs);
  const visible = sortSuggestions(deck.suggestions || []).filter((s) => !isSuggestionFiltered(s, prefs));
  return filterByScope(visible, scopeSuggestionIds);
}

export function deckReviewStatusCounts(
  deck: DeckEntry,
  progress: ReviewProgress,
  deckPrefs: Record<string, DeckPrefs>,
): { pending: number; accepted: number; rejected: number; skipped: number } {
  let pending = 0;
  let accepted = 0;
  let rejected = 0;
  let skipped = 0;
  for (const s of allVisibleSuggestions(deck, deckPrefs)) {
    const status = getDecision(progress, String(s.suggestion_id))?.status || 'pending';
    if (status === 'accepted') accepted++;
    else if (status === 'rejected') rejected++;
    else if (status === 'skipped') skipped++;
    else pending++;
  }
  return { pending, accepted, rejected, skipped };
}

export function pendingSuggestions(
  deck: DeckEntry,
  progress: ReviewProgress,
  deckPrefs: Record<string, DeckPrefs>,
  scopeSuggestionIds?: readonly string[] | null,
): Suggestion[] {
  const prefs = getDeckPreferences(deck, deckPrefs);
  const pending = sortSuggestions(deck.suggestions || []).filter((s) => {
    const d = getDecision(progress, String(s.suggestion_id));
    if (d && d.status !== 'skipped') {
      return false;
    }
    return !isSuggestionFiltered(s, prefs);
  });
  return filterByScope(pending, scopeSuggestionIds);
}

export function currentSuggestion(
  deck: DeckEntry,
  progress: ReviewProgress,
  deckPrefs: Record<string, DeckPrefs>,
  suggestionIndex: number,
  scopeSuggestionIds?: readonly string[] | null,
): Suggestion | null {
  const pending = pendingSuggestions(deck, progress, deckPrefs, scopeSuggestionIds);
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
  if (transferSource !== 'deck-suggest' && transferSource !== 'generate') {
    return null;
  }
  const summary = handoffSnapshotSummary(data);
  if (summary.missingSnapshots > 0) {
    return summary.missingSnapshots + ' deck(s) missing snapshots — generate again.';
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

export function jumpToPendingSuggestion(
  state: DeckReviewState,
  index: number,
  scopeSuggestionIds?: readonly string[] | null,
): DeckReviewState {
  if (!state.fileId || !state.activeDeckId || !state.data) {
    return state;
  }
  const deck = state.data.decks.find((d) => d.deck_id === state.activeDeckId);
  if (!deck) {
    return state;
  }
  const pending = pendingSuggestions(deck, state.progress, state.deckPrefs, scopeSuggestionIds);
  if (!pending.length) {
    return state;
  }
  const max = pending.length - 1;
  const suggestionIndex = Math.max(0, Math.min(max, index));
  if (suggestionIndex === state.suggestionIndex) {
    return state;
  }
  const progress = {
    ...state.progress,
    currentSuggestionIndex: {
      ...state.progress.currentSuggestionIndex,
      [state.activeDeckId]: suggestionIndex,
    },
  };
  saveReviewProgress(state.fileId, progress);
  return { ...state, progress, suggestionIndex };
}

export function navigatePendingSuggestion(
  state: DeckReviewState,
  delta: number,
  scopeSuggestionIds?: readonly string[] | null,
): DeckReviewState {
  return jumpToPendingSuggestion(state, state.suggestionIndex + delta, scopeSuggestionIds);
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
  return transferSource != null;
}

function mapDeckSuggestions(
  decks: DeckEntry[],
  deckId: string,
  mapFn: (suggestions: Suggestion[]) => Suggestion[],
): DeckEntry[] {
  return decks.map((deck) => {
    if (String(deck.deck_id) !== String(deckId)) return deck;
    return {
      ...deck,
      suggestions: mapFn([...(deck.suggestions || [])] as Suggestion[]),
    };
  });
}

/** Append missing-card suggestions and jump the filmstrip to the first appended pending item. */
export function appendDeckSuggestions(
  state: DeckReviewState,
  deckId: string,
  incoming: Suggestion[],
): DeckReviewState {
  if (!state.data || !deckId || !incoming.length) return state;

  const deck = state.data.decks.find((d) => String(d.deck_id) === String(deckId));
  if (!deck) return state;

  const existingIds = new Set((deck.suggestions || []).map((s) => String(s.suggestion_id)));
  const toAdd = incoming.filter((s) => !existingIds.has(String(s.suggestion_id)));
  const focusId = String((toAdd[0] || incoming[0]).suggestion_id);

  const nextData: SuggestionsPayload = {
    ...state.data,
    decks: mapDeckSuggestions(state.data.decks, deckId, (suggestions) => {
      if (!toAdd.length) return suggestions;
      return [...suggestions, ...toAdd];
    }),
  };

  const nextDeck = nextData.decks.find((d) => String(d.deck_id) === String(deckId))!;
  const pending = pendingSuggestions(nextDeck, state.progress, state.deckPrefs);
  const focusIndex = Math.max(
    0,
    pending.findIndex((s) => String(s.suggestion_id) === focusId),
  );
  const suggestionIndex = focusIndex >= 0 ? focusIndex : pending.length ? pending.length - 1 : 0;

  const progress = {
    ...state.progress,
    currentDeckId: deckId,
    currentSuggestionIndex: {
      ...state.progress.currentSuggestionIndex,
      [deckId]: suggestionIndex,
    },
  };
  if (state.fileId) {
    saveReviewProgress(state.fileId, progress);
  }

  return {
    ...state,
    data: nextData,
    activeDeckId: deckId,
    suggestionIndex,
    progress,
  };
}

export function patchSuggestionLozenges(
  state: DeckReviewState,
  deckId: string,
  suggestionId: string,
  lozenges: ProfileLozenge[],
): DeckReviewState {
  if (!state.data) return state;
  return {
    ...state,
    data: {
      ...state.data,
      decks: mapDeckSuggestions(state.data.decks, deckId, (suggestions) =>
        suggestions.map((s) =>
          String(s.suggestion_id) === String(suggestionId)
            ? { ...s, profile_lozenges: lozenges }
            : s,
        ),
      ),
    },
  };
}

/** After profile YAML append, mark confirmed values existing on remaining missing-card suggestions. */
export function promoteConfirmedLozengesOnDeck(
  state: DeckReviewState,
  deckId: string,
  confirmed: ProfileLozengeUpdates,
): DeckReviewState {
  if (!state.data) return state;
  const total =
    confirmed.themes.length +
    confirmed.keyword_interests.length +
    confirmed.typal_types.length +
    confirmed.art_tags.length;
  if (!total) return state;
  return {
    ...state,
    data: {
      ...state.data,
      decks: mapDeckSuggestions(state.data.decks, deckId, (suggestions) =>
        suggestions.map((s) => {
          if (s.source !== 'missing_cards') return s;
          return {
            ...s,
            profile_lozenges: markLozengesExisting(s.profile_lozenges, confirmed),
          };
        }),
      ),
    },
  };
}

export function profileUpdatesFromSuggestion(suggestion: Suggestion): ProfileLozengeUpdates {
  return plusLozengesToProfileUpdates(suggestion.profile_lozenges);
}

