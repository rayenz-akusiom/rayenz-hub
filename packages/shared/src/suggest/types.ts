export type SetPoolCard = {
  name: string;
  set_code?: string;
  collector_number?: string;
  scryfall_id?: string | null;
  scryfall_uri?: string | null;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  oracle_id?: string | null;
  illustration_id?: string | null;
  oracle_tags?: string[];
  art_tags?: string[];
  tags?: string[];
  color_identity?: string[];
  colorIdentity?: string[];
  manaValue?: number;
  setCode?: string;
  collectorNumber?: string;
  typeLine?: string;
  oracleText?: string;
};

export type SetScope = {
  primaryCode?: string;
  codes: string[];
  codesKey?: string;
  setName?: string;
  cards: SetPoolCard[];
  cardsByName?: Record<string, SetPoolCard[]>;
  indexVersion?: number;
  fetchedAt?: string;
  source?: string;
  complete?: boolean;
  fromCache?: boolean;
};

export type SnapshotCard = {
  name?: string;
  set_code?: string | null;
  collector_number?: string | null;
  primary_category?: string;
  categories?: string[];
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  color_identity?: string[];
  quantity?: number;
};

export type DeckProfileConstraints = {
  max_cmc?: number;
  min_cmc?: number;
  avoid_tags?: string[];
};

export type DeckProfile = {
  deck_id?: string;
  format?: string;
  roles?: Array<{ id: string; priority?: string; tags?: string[]; target_count?: number }>;
  tags?: string[];
  protected_cards?: string[];
  blocked_cards?: string[];
  typal_types?: string[];
  themes?: string[];
  keyword_interests?: string[];
  art_tags?: string[];
  constraints?: DeckProfileConstraints;
};

export type DeckRecord = {
  deck_id: string;
  deck_name: string;
  archidekt_url?: string;
  format?: string;
  /** Hub ownership; theory decks are excluded from Suggest. */
  ownership?: 'owned' | 'theory';
  profile?: DeckProfile;
  profile_preferences?: { protected_cards: string[]; blocked_cards: string[] };
  deck_snapshot?: {
    fetched_at?: string;
    source?: string;
    cards?: SnapshotCard[];
  };
  eligibility?: {
    eligible: boolean;
    reason?: string;
    message?: string;
    format?: string;
    inferred?: boolean;
  };
  ruleContext?: {
    version: number;
    swapQueue: import('@rayenz-hub/shared').SwapQueueResult | null;
    deckNames: Record<string, boolean>;
    ownedNames: Record<string, boolean>;
    cutCandidates: SnapshotCard[] | null;
  };
};

export type SuggestionSignals = {
  keywords?: string[];
  types?: string[];
  tags?: string[];
  textHints?: string[];
};

export type Suggestion = {
  suggestion_id: string;
  action: string;
  card: SetPoolCard;
  quantity: number;
  roles_matched: string[];
  confidence: 'high' | 'medium' | 'low' | string;
  rationale: string;
  tags: string[];
  replaces: Array<{ name: string; quantity: number }>;
  fills_swap_slot?: string;
  priority_tier: 'swap' | 'normal' | string;
  swap_source?: string;
  signals?: SuggestionSignals;
  /** Client-injected from the missing-cards picker. */
  source?: 'missing_cards';
  profile_lozenges?: import('./missing-cards.js').ProfileLozenge[];
};

export type RuleAudit = {
  ruleId: string;
  deckId?: string;
  suggestionsAdded: number;
  skippedReason?: string;
};

export type Coverage = { cardsResolved: number; cardsWithTags: number; percent: number };

export type PageDeckResult = {
  deckId: string;
  deckName: string;
  skipped: boolean;
  skipReason?: string;
  message?: string;
  suggestions: Suggestion[];
  audit: RuleAudit[];
};

export type DeckResult = {
  deck: DeckRecord;
  skipped?: boolean;
  skip_reason?: string;
  message?: string;
  suggestions?: Suggestion[];
  audit?: Array<Record<string, unknown>>;
  analysis?: Record<string, unknown> | null;
  taggerCoverage?: { cardsResolved: number; cardsWithTags: number; percent: number };
  debugTrace?: DebugEntry[] | null;
  error?: string;
};

export type GenerationRun = {
  runId: string;
  rulesExecuted: Array<Record<string, unknown>>;
  taggerCoverage?: { cardsResolved: number; cardsWithTags: number; percent: number };
  deckResults: DeckResult[];
};

export type DeckSuggestSettings = {
  setCodes?: string;
  folderUrl?: string;
  deckLoadTab?: string;
  customDeckUrls?: string;
  pasteDeckName?: string;
  pasteDeckUrl?: string;
  pasteDeckImport?: string;
  rulesDebug?: boolean;
};

export type DeckSelection = {
  folderUrl: string;
  decks: DeckRecord[];
  selectedIds: string[];
};

export type DeckSuggestState = {
  setScope: SetScope | null;
  deckSelection: DeckSelection;
  profilesConnected: boolean;
  generationRun: GenerationRun | null;
  ui: { setCodesInput: string; deckLoadTab?: string | null };
  settings: DeckSuggestSettings;
  statusMessage: string;
  generating: boolean;
};

export type ReadinessItem = {
  id: string;
  ok: boolean;
  label: string;
};

export type ReadinessResult = {
  ok: boolean;
  missing: string[];
  items: ReadinessItem[];
  generating: boolean;
};

export type DebugEntry = {
  deckId?: string;
  ruleId?: string;
  outcome?: string;
  subject?: string;
  cardIn?: string;
  cardOut?: string;
  reason?: string;
  detail?: string;
};

export type TaggerContext = {
  resolve: (name: string, card?: SnapshotCard | SetPoolCard) => { cardName: string; taggerTags: string[]; source: string };
  cache: Record<string, { cardName: string; taggerTags: string[]; source: string }>;
  coverage: { cardsResolved: number; cardsWithTags: number; percent: number };
};

export type DeckLoadTab = 'hub' | 'folder' | 'paste-import' | 'paste-urls' | 'upload';
