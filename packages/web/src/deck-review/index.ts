export * from './types';
export * from './data';
export * from './decisions';
export * from './pickers';
export * from './profiles';
export * from './review';
export * from './archidekt-bridge';
export { DeckReviewApp } from './DeckReviewApp';

import { getSwapQueue, sortSuggestions, validatePayload } from '@rayenz-hub/shared';
import {
  getSuggestionStaleness,
  getSwapQueueReconciliation,
  isMissingSuggestedCut,
  printingToCardIn,
} from './data';
import {
  acceptedForDeck,
  decisionRecapInOut,
  decisionStatusLabel,
} from './decisions';
import { deckCutOptions } from './pickers';
import { getDeckPreferences, isSuggestionFiltered } from './profiles';
import {
  applyLoadedSuggestions,
  createInitialReviewState,
  loadSuggestionsData,
  showDownloadJson,
  refreshAllDecksLabel,
} from './review';

/** Test-friendly namespace mirroring legacy window.DeckReview exports. */
export const DeckReview = {
  deriveSwapQueue: getSwapQueue,
  validateSuggestions: validatePayload,
  sortSuggestions,
  getSuggestionStaleness,
  getSwapQueueReconciliation,
  deckCutOptions,
  getDeckPreferences,
  isSuggestionFiltered,
  decisionStatusLabel,
  decisionRecapInOut,
  isMissingSuggestedCut,
  printingToCardIn,
  acceptedForDeck,
  loadSuggestionsData,
  applyLoadedSuggestions,
  createInitialReviewState,
  showDownloadJson,
  refreshAllDecksLabel,
};

export { getSwapQueue as deriveSwapQueueFn };
