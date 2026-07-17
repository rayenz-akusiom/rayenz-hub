import type { DeckEntry, Suggestion, SuggestionsPayload } from '@rayenz-hub/shared';
import type { ReviewProgress } from '../lib/hub-storage';

export type TransferSource = 'deck-suggest' | 'upload' | 'latest' | 'handoff' | null;

export type StatusCardTab = 'decisions' | 'queue' | 'update';

export type DeckPrefs = {
  blocked_cards: string[];
  protected_cards: string[];
};

export type CardInSelection = {
  name: string;
  set_code: string;
  collector_number: string;
  scryfall_id?: string;
  scryfall_uri?: string;
  finish: string;
};

export type CardOutSelection = {
  name: string;
  quantity: number;
  set_code: string | null;
  collector_number: string | null;
};

export type AcceptedSwap = {
  suggestion_id: string;
  deck_id: string;
  archidekt_deck_id: number | null;
  archidekt_url?: string;
  action?: string;
  quantity: number;
  card_in: CardInSelection;
  card_out: CardOutSelection;
  swap_categories: boolean;
};

export type ReviewDecision = {
  status: 'accepted' | 'rejected' | 'skipped' | 'pending';
  accepted?: AcceptedSwap;
};

export type ScryfallPrint = {
  id: string;
  name?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  scryfall_uri?: string;
  layout?: string;
  finishes?: string[];
  prices?: { usd?: string };
};

export type CutOption = {
  name: string;
  quantity: number;
  set_code: string | null;
  collector_number: string | null;
  primary_category?: string | null;
};

export type DeckReviewState = {
  data: SuggestionsPayload | null;
  fileId: string | null;
  progress: ReviewProgress;
  activeDeckId: string | null;
  suggestionIndex: number;
  deckPrefs: Record<string, DeckPrefs>;
  profileStatus: string;
  profilesConnected: boolean;
  showAllMode: boolean;
  statusCardTab: StatusCardTab;
  transferSource: TransferSource;
};

export type { DeckEntry, Suggestion, SuggestionsPayload };
