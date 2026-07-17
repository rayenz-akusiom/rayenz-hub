import { deriveSwapQueue, type DeckWithSnapshot, type SwapQueueResult } from './swap-queue';

export const SUPPORTED_SCHEMAS: Record<string, boolean> = { '1.0': true, '1.1': true };
const CONFIDENCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export type Suggestion = {
  suggestion_id?: string;
  replaces?: string | string[];
  roles_matched?: string | string[];
  priority_tier?: string;
  confidence?: string;
  [key: string]: unknown;
};

export type ProfilePreferences = {
  protected_cards: string[];
  blocked_cards: string[];
};

export type DeckEntry = DeckWithSnapshot & {
  deck_id?: string;
  deck_name?: string;
  archidekt_url?: string;
  format?: string;
  suggestions?: Suggestion[];
  profile_preferences?: ProfilePreferences;
  analysis?: Record<string, unknown>;
  skipped?: boolean;
  skip_reason?: string | null;
  _swapQueue?: SwapQueueResult | null;
  profile?: { tags?: string[]; protected_cards?: string[]; blocked_cards?: string[] };
};

export type SuggestionsPayload = {
  meta: {
    schema_version: string;
    set_code?: string;
    set_name?: string;
    set_codes?: string[];
    sets?: Array<{ code: string; name: string; set_type: string; card_count: number }>;
    generated_at?: string;
    card_count?: number;
    notes?: string;
    [key: string]: unknown;
  };
  decks: DeckEntry[];
};

export function normalizeArrayValue<T>(value: T | T[] | null | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function normalizeSuggestion(suggestion: Suggestion | null | undefined): Suggestion | null | undefined {
  if (!suggestion) {
    return suggestion;
  }
  suggestion.replaces = normalizeArrayValue(suggestion.replaces as string | string[]);
  suggestion.roles_matched = normalizeArrayValue(suggestion.roles_matched as string | string[]);
  return suggestion;
}

export function normalizeProfilePreferences(prefs?: Partial<ProfilePreferences> | null): ProfilePreferences {
  const p = prefs || {};
  return {
    protected_cards: normalizeArrayValue(p.protected_cards),
    blocked_cards: normalizeArrayValue(p.blocked_cards),
  };
}

export function sortSuggestions(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.slice().sort((a, b) => {
    const tierA = a.priority_tier === 'swap' ? 0 : 1;
    const tierB = b.priority_tier === 'swap' ? 0 : 1;
    if (tierA !== tierB) {
      return tierA - tierB;
    }
    const confA = a.confidence != null && CONFIDENCE_ORDER[a.confidence] != null ? CONFIDENCE_ORDER[a.confidence] : 9;
    const confB = b.confidence != null && CONFIDENCE_ORDER[b.confidence] != null ? CONFIDENCE_ORDER[b.confidence] : 9;
    if (confA !== confB) {
      return confA - confB;
    }
    return String(a.suggestion_id).localeCompare(String(b.suggestion_id));
  });
}

export function attachSwapQueueCache(deck: DeckEntry): DeckEntry {
  if (!deck || deck._swapQueue !== undefined) {
    return deck;
  }
  if (!deck.deck_snapshot) {
    deck._swapQueue = null;
    return deck;
  }
  deck._swapQueue = deriveSwapQueue(deck);
  return deck;
}

export function getSwapQueue(deck: DeckEntry | null | undefined): SwapQueueResult | null {
  if (!deck) {
    return null;
  }
  attachSwapQueueCache(deck);
  return deck._swapQueue ?? null;
}

export function normalizeDeckEntry(deck: DeckEntry | null | undefined): DeckEntry | null | undefined {
  if (!deck) {
    return deck;
  }
  deck.suggestions = sortSuggestions(
    normalizeArrayValue(deck.suggestions).map((s) => normalizeSuggestion(s) as Suggestion),
  );
  deck.profile_preferences = normalizeProfilePreferences(deck.profile_preferences);
  attachSwapQueueCache(deck);
  return deck;
}

export function validatePayload(data: unknown): SuggestionsPayload {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid JSON: expected an object');
  }
  const payload = data as SuggestionsPayload;
  if (!payload.meta || !SUPPORTED_SCHEMAS[payload.meta.schema_version]) {
    throw new Error('Unsupported or missing schema_version (need 1.0 or 1.1)');
  }
  if (!Array.isArray(payload.decks)) {
    throw new Error('Missing decks array');
  }
  payload.decks.forEach((deck) => {
    normalizeDeckEntry(deck);
  });
  return payload;
}

export type SetScope = {
  primaryCode: string;
  setName: string;
  codes: string[];
  cards: unknown[];
};

export function buildMetaFromSetScope(setScope: SetScope, notes?: string) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    schema_version: '1.1',
    set_code: setScope.primaryCode,
    set_name: setScope.setName,
    set_codes: setScope.codes,
    sets: setScope.codes.map((code) => ({
      code,
      name: code,
      set_type: 'expansion',
      card_count: setScope.cards.length,
    })),
    generated_at: today,
    card_count: setScope.cards.length,
    notes: notes || '',
  };
}

export function buildDeckEntry(options: {
  deck?: DeckEntry;
  analysis?: Record<string, unknown>;
  suggestions?: Suggestion[];
  skipped?: boolean;
  skip_reason?: string | null;
  swapQueueAnalysisFn?: (deck: DeckEntry) => unknown;
}): DeckEntry {
  const opts = options || {};
  const deck = opts.deck || {};
  const analysis = opts.analysis || {};
  let swapQueueAnalysis = analysis.swap_queue;
  if (!swapQueueAnalysis && opts.swapQueueAnalysisFn) {
    swapQueueAnalysis = opts.swapQueueAnalysisFn(deck);
  }
  return normalizeDeckEntry({
    deck_id: deck.deck_id,
    deck_name: deck.deck_name,
    archidekt_url: deck.archidekt_url || '',
    format: deck.format || 'commander',
    analysis: {
      swap_queue: swapQueueAnalysis || null,
      inferred_themes: (deck.profile && deck.profile.tags) || [],
    },
    suggestions: opts.suggestions || [],
    deck_snapshot: deck.deck_snapshot || null,
    profile_preferences: deck.profile_preferences || {
      protected_cards: (deck.profile && deck.profile.protected_cards) || [],
      blocked_cards: (deck.profile && deck.profile.blocked_cards) || [],
    },
    skipped: opts.skipped || false,
    skip_reason: opts.skip_reason || null,
  }) as DeckEntry;
}

export function buildPayload(meta: SuggestionsPayload['meta'], decks: DeckEntry[]): SuggestionsPayload {
  return {
    meta,
    decks: (decks || []).map((deck) => normalizeDeckEntry(deck) as DeckEntry),
  };
}

export const SuggestionsBundle = {
  SUPPORTED_SCHEMAS,
  normalizeArrayValue,
  normalizeSuggestion,
  normalizeProfilePreferences,
  sortSuggestions,
  attachSwapQueueCache,
  getSwapQueue,
  normalizeDeckEntry,
  validatePayload,
  buildMetaFromSetScope,
  buildDeckEntry,
  buildPayload,
};
