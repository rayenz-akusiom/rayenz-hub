import type { OrderReconcileSettingsPayload } from '@rayenz-hub/shared';

export const ASSIGN_PHASE_ID = '__assign__';
export const STAGING_DECK_ID = '__staging__';

export type Phase = 'input' | 'assign' | 'reconcile' | 'staging';
export type InputMode = 'list' | 'email';

export type AcquiredCard = {
  id?: string;
  name: string;
  quantity?: number;
  set_code?: string | null;
  collector_number?: string | null;
  finish?: string | null;
};

export type CardCopy = {
  copy_id: string;
  acquired_id: string;
  card_name: string;
  set_code?: string | null;
  collector_number?: string | null;
  finish?: string | null;
};

export type QueuedCard = {
  name: string;
  set_code?: string | null;
  collector_number?: string | null;
  quantity?: number;
};

export type MaybeboardEntry = {
  name: string;
  set_code?: string | null;
  collector_number?: string | null;
  quantity: number;
};

export type AssignmentCandidate = {
  deck_id: string;
  deck_name: string;
  slot_key: string;
  queued_in: QueuedCard;
  paired_out: QueuedCard | null;
  destination_category?: string;
  is_cube: boolean;
  is_maybeboard?: boolean;
  maybeboard_entry: MaybeboardEntry | null;
};

export type AssignmentIndex = {
  swapByName: Record<string, AssignmentCandidate[]>;
  maybeboardByName: Record<string, AssignmentCandidate[]>;
};

export type Assignment = {
  copy_id: string;
  card_name: string;
  deck_id: string;
  deck_name: string;
  slot_key: string;
  queued_in: QueuedCard;
  paired_out: QueuedCard | null;
  destination_category: string;
  is_cube: boolean;
  maybeboard_entry: MaybeboardEntry | null;
  reason: string;
};

export type NeedsReviewReason = 'maybeboard' | 'unmatched' | 'extra' | 'conflict';

export type NeedsReviewItem = {
  copy: CardCopy;
  reason: NeedsReviewReason;
  candidates: AssignmentCandidate[];
  all_candidates?: AssignmentCandidate[];
  totalDemand?: number;
  assigned_deck_id: string;
  destination_category: string;
  preselected_candidate?: AssignmentCandidate | null;
  conflict_note?: string;
};

export type ReconcileItem = {
  item_id: string;
  copy_id: string;
  slot_key: string | null;
  deck_id: string;
  deck_name: string;
  card_name: string;
  quantity: number;
  queued_in: QueuedCard | null;
  paired_out: QueuedCard | null;
  destination_category: string;
  is_cube: boolean;
  maybeboard_entry: MaybeboardEntry | null;
  acquired_set: string | null;
  acquired_collector: string | null;
  type: string;
  default_out?: CutOption | null;
};

export type CutOption = {
  name: string;
  set_code?: string | null;
  collector_number?: string | null;
  primary_category?: string;
};

export type PrintingParts = {
  name: string;
  set_code?: string | null;
  collector_number?: string | null;
  finish?: string;
  scryfall_id?: string;
};

export type AcceptedDecision = {
  quantity: number;
  destination_category: string;
  card_in: PrintingParts;
  card_out: CutOption | null;
};

export type ItemDecision =
  | { status: 'accepted'; accepted: AcceptedDecision }
  | { status: 'skipped' }
  | { status: 'rejected' };

export type DeckSnapshot = {
  cards?: {
    name?: string;
    set_code?: string | null;
    collector_number?: string | null;
    quantity?: number;
    primary_category?: string;
    categories?: string[];
    color_identity?: string[];
  }[];
  category_settings?: Record<string, { includedInDeck?: boolean; includedInPrice?: boolean }> | null;
};

export type OrderReconcileDeck = {
  deck_id: string;
  deck_name: string;
  archidekt_url?: string;
  deck_snapshot?: DeckSnapshot;
};

export type OrderReconcileProgress = {
  decisions: Record<string, ItemDecision>;
  assignments?: Assignment[];
  needsReview?: NeedsReviewItem[];
  copies?: CardCopy[];
  acquiredCards?: AcquiredCard[];
  reconcileItems?: ReconcileItem[];
  completedDecks?: Record<string, boolean>;
  activeDeckId?: string | null;
  phase?: Phase;
  isProxyOrder?: boolean;
};

export type OrderReconcileState = {
  phase: Phase;
  sessionId: string | null;
  settings: OrderReconcileSettingsPayload;
  acquiredCards: AcquiredCard[];
  copies: CardCopy[];
  assignments: Assignment[];
  needsReview: NeedsReviewItem[];
  decks: OrderReconcileDeck[];
  stagingDeck: OrderReconcileDeck | null;
  reconcileItems: ReconcileItem[];
  completedDecks: Record<string, boolean>;
  activeDeckId: string | null;
  assignmentIndex: AssignmentIndex | null;
  inputMode: InputMode;
  isProxyOrder: boolean;
  colorIdentityCache: Record<string, string[]>;
  progress: OrderReconcileProgress;
  statusMessage: string;
};
