import type { DebugEntry, DeckProfile, DeckRecord, SetPoolCard, SetScope, SnapshotCard, Suggestion, TaggerContext } from './types';
import { countTagOverlap } from './tagger';
import { isSwapQueueCategoryName } from '@rayenz-hub/shared';

const PROTECTED_CATEGORIES: Record<string, boolean> = {
  Commander: true,
  Lieutenant: true,
  Lieutenants: true,
};

export function listHasName(list: string[] | undefined, name: string): boolean {
  return (list || []).some((n) => String(n).toLowerCase() === String(name).toLowerCase());
}

export function normalizeProfile(profile?: DeckProfile | null) {
  profile = profile || {};
  return {
    roles: profile.roles || [],
    tags: profile.tags || [],
    protected_cards: profile.protected_cards || [],
    blocked_cards: profile.blocked_cards || [],
  };
}

export function isCommanderCategory(card: SnapshotCard | null | undefined): boolean {
  const primary = card && (card.primary_category || (card.categories && card.categories[0]));
  return !!(primary && PROTECTED_CATEGORIES[primary]);
}

export function isBlockedAdd(name: string, profile?: DeckProfile | null): boolean {
  return listHasName(normalizeProfile(profile).blocked_cards, name);
}

export function isProtectedCut(name: string, profile?: DeckProfile | null): boolean {
  return listHasName(normalizeProfile(profile).protected_cards, name);
}

export function passesBlocklist(suggestion: Suggestion | null | undefined, profile?: DeckProfile | null): boolean {
  if (!suggestion || !suggestion.card) {
    return false;
  }
  if (isBlockedAdd(suggestion.card.name, profile)) {
    return false;
  }
  return !(suggestion.replaces || []).some((r) => r.name && isProtectedCut(r.name, profile));
}

export function deckNamesInSnapshot(deck: DeckRecord): Record<string, boolean> {
  if (deck.ruleContext && deck.ruleContext.deckNames) {
    return deck.ruleContext.deckNames;
  }
  const names: Record<string, boolean> = {};
  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((c) => {
    if (c.name) {
      names[c.name.toLowerCase()] = true;
    }
  });
  return names;
}

export function cutCandidates(deck: DeckRecord): SnapshotCard[] {
  if (deck.ruleContext && deck.ruleContext.cutCandidates) {
    return deck.ruleContext.cutCandidates;
  }
  const options: SnapshotCard[] = [];
  const seen: Record<string, boolean> = {};
  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((card) => {
    const primary = card.primary_category || (card.categories && card.categories[0]);
    if (primary && PROTECTED_CATEGORIES[primary]) {
      return;
    }
    if (isSwapQueueCategoryName(primary)) {
      return;
    }
    if (!card.name || seen[card.name]) {
      return;
    }
    seen[card.name] = true;
    options.push(card);
  });
  if (deck.ruleContext) {
    deck.ruleContext.cutCandidates = options;
  }
  return options;
}

function soughtTags(profile?: DeckProfile | null): string[] {
  const tags: string[] = [];
  normalizeProfile(profile).roles.forEach((role) => {
    (role.tags || []).forEach((t) => {
      if (tags.indexOf(t) < 0) {
        tags.push(t);
      }
    });
  });
  normalizeProfile(profile).tags.forEach((t) => {
    if (tags.indexOf(t) < 0) {
      tags.push(t);
    }
  });
  return tags;
}

function priorityWeight(priority?: string): number {
  if (priority === 'high') {
    return 3;
  }
  if (priority === 'medium') {
    return 2;
  }
  if (priority === 'low') {
    return 1;
  }
  return 0;
}

function roleFillScore(card: SnapshotCard, profile?: DeckProfile | null): number {
  const roles = normalizeProfile(profile).roles;
  let best = 0;
  roles.forEach((role) => {
    const overlap = countTagOverlap(card, role.tags || [], null);
    if (overlap > 0) {
      best = Math.max(best, priorityWeight(role.priority));
    }
  });
  return best;
}

export function rankCutCandidates(
  candidates: SnapshotCard[],
  profile?: DeckProfile | null,
  taggerCtx?: TaggerContext | null,
): SnapshotCard[] {
  const sought = soughtTags(profile);
  return candidates.slice().sort((a, b) => {
    const overlapA = countTagOverlap(a, sought, taggerCtx);
    const overlapB = countTagOverlap(b, sought, taggerCtx);
    if (overlapA !== overlapB) {
      return overlapA - overlapB;
    }
    const roleA = roleFillScore(a, profile);
    const roleB = roleFillScore(b, profile);
    if (roleA !== roleB) {
      return roleB - roleA;
    }
    const cmcA = a.cmc != null ? a.cmc : 0;
    const cmcB = b.cmc != null ? b.cmc : 0;
    if (cmcA !== cmcB) {
      return cmcB - cmcA;
    }
    return String(a.name).localeCompare(String(b.name));
  });
}

export function pickBestCut(
  deck: DeckRecord,
  profile?: DeckProfile | null,
  taggerCtx?: TaggerContext | null,
): SnapshotCard | null {
  const ranked = rankCutCandidates(cutCandidates(deck), profile, taggerCtx);
  return ranked[0] || null;
}

export function suggestionPairKey(suggestion: Suggestion): string {
  const rep = suggestion.replaces && suggestion.replaces[0];
  return (suggestion.card && suggestion.card.name) + '::' + (rep && rep.name);
}

export function hasDuplicate(existing: Suggestion[], suggestion: Suggestion): boolean {
  const key = suggestionPairKey(suggestion);
  return existing.some((s) => suggestionPairKey(s) === key);
}

export function nextSuggestionId(deckId: string, existing: Suggestion[]): string {
  let max = 0;
  existing.forEach((s) => {
    const m = String(s.suggestion_id || '').match(/-(\d+)$/);
    if (m) {
      max = Math.max(max, parseInt(m[1], 10));
    }
  });
  return deckId + '-' + String(max + 1).padStart(3, '0');
}

export function snapshotCardToSuggestionCard(card: SnapshotCard): SetPoolCard {
  return {
    name: card.name || '',
    set_code: (card.set_code || '').toUpperCase(),
    collector_number: String(card.collector_number || ''),
    scryfall_id: null,
    scryfall_uri: undefined,
    mana_cost: undefined,
    cmc: card.cmc != null ? card.cmc : undefined,
    type_line: card.type_line || undefined,
  };
}

export function setCardToSuggestionCard(card: SetPoolCard): SetPoolCard {
  return {
    name: card.name,
    set_code: (card.set_code || '').toUpperCase(),
    collector_number: String(card.collector_number || ''),
    scryfall_id: card.scryfall_id || undefined,
    scryfall_uri: card.scryfall_uri || undefined,
    mana_cost: card.mana_cost || undefined,
    cmc: card.cmc != null ? card.cmc : undefined,
    type_line: card.type_line || undefined,
  };
}

let rejectReasonHook:
  | ((suggestion: Suggestion, profile: DeckProfile | undefined, existing: Suggestion[]) => string | null)
  | null = null;

export function registerRejectReason(
  fn: (suggestion: Suggestion, profile: DeckProfile | undefined, existing: Suggestion[]) => string | null,
): void {
  rejectReasonHook = fn;
}

export function emitIfValid(
  suggestion: Suggestion,
  profile: DeckProfile | undefined,
  existing: Suggestion[],
  debug?: { ruleId?: string; collector?: { push: (e: DebugEntry) => void } } | null,
  rejectReasonFn?: (s: Suggestion, p: DeckProfile | undefined, e: Suggestion[]) => string | null,
): Suggestion | null {
  let reason: string | null = null;
  const rejectFn = rejectReasonFn || rejectReasonHook;
  if (rejectFn) {
    reason = rejectFn(suggestion, profile, existing);
  } else if (!passesBlocklist(suggestion, profile)) {
    reason = isBlockedAdd(suggestion.card.name, profile) ? 'blocked_add' : 'protected_cut';
  } else if (hasDuplicate(existing, suggestion)) {
    reason = 'duplicate_pair';
  }
  if (reason) {
    if (debug && debug.collector) {
      const rep = suggestion.replaces && suggestion.replaces[0];
      debug.collector.push({
        ruleId: debug.ruleId || 'emit',
        outcome: 'rejected',
        subject: suggestion.card && suggestion.card.name,
        cardIn: suggestion.card && suggestion.card.name,
        cardOut: rep && rep.name,
        reason,
      });
    }
    return null;
  }
  return suggestion;
}

export function findInSetPool(cardName: string, setScope: SetScope | null): SetPoolCard | null {
  const nameLower = String(cardName || '').toLowerCase();
  let matches: SetPoolCard[];
  if (setScope && setScope.cardsByName) {
    matches = setScope.cardsByName[nameLower] || [];
  } else {
    matches = ((setScope && setScope.cards) || []).filter(
      (c) => String(c.name).toLowerCase() === nameLower,
    );
  }
  if (!matches.length) {
    return null;
  }
  const primary = String(setScope!.primaryCode || '').toUpperCase();
  const preferred = matches.find((c) => String(c.set_code || '').toUpperCase() === primary);
  return preferred || matches[0];
}

export function resolveQueuedInForScope(
  inCard: { name: string },
  setScope: SetScope,
): SetPoolCard | null {
  const poolCard = findInSetPool(inCard.name, setScope);
  if (!poolCard) {
    return null;
  }
  return setCardToSuggestionCard(poolCard);
}

export const RuleGuards = {
  listHasName,
  normalizeProfile,
  isCommanderCategory,
  isBlockedAdd,
  isProtectedCut,
  passesBlocklist,
  deckNamesInSnapshot,
  cutCandidates,
  rankCutCandidates,
  pickBestCut,
  suggestionPairKey,
  hasDuplicate,
  nextSuggestionId,
  snapshotCardToSuggestionCard,
  setCardToSuggestionCard,
  emitIfValid,
  findInSetPool,
  resolveQueuedInForScope,
};
