import type { DeckProfile, DeckRecord, SetPoolCard, SetScope, Suggestion, SuggestionSignals, TaggerContext } from './types';
import * as G from './rule-guards';
import { cardMatchesFocus, normalizeFocusTags } from './focus-filter';

export type SynergyHit = {
  card: SetPoolCard;
  confidence: 'medium' | 'low';
  rationale: string;
  rolesMatched: string[];
  signals: SuggestionSignals;
};

function inScope(setCard: SetPoolCard, setScope: SetScope): boolean {
  const codes: Record<string, boolean> = {};
  (setScope.codes || []).forEach((c) => {
    codes[String(c).toUpperCase()] = true;
  });
  const code = String(setCard.set_code || '').toUpperCase();
  return !!codes[code];
}

export function eligibleSetCards(
  deck: DeckRecord,
  setScope: SetScope,
  profile?: DeckProfile,
  focusTags?: string[],
): SetPoolCard[] {
  const ownedNames = G.ownedNamesInSnapshot(deck);
  const focus = normalizeFocusTags(focusTags);
  return (setScope.cards || []).filter((setCard) => {
    if (!inScope(setCard, setScope)) return false;
    if (focus.length && !cardMatchesFocus(setCard, focus)) return false;
    if (ownedNames[setCard.name.toLowerCase()]) return false;
    if (!G.isColorIdentityLegal(setCard, deck)) return false;
    if (G.isBlockedAdd(setCard.name, profile)) return false;
    if (G.violatesConstraints(setCard, profile)) return false;
    return true;
  });
}

export function emitSynergyHits(
  ruleId: string,
  hits: SynergyHit[],
  deck: DeckRecord,
  profile: DeckProfile | undefined,
  existing: Suggestion[],
  _taggerCtx: TaggerContext,
  debug?: { ruleId?: string; collector?: { push: (e: Record<string, unknown>) => void } },
): Suggestion[] {
  const added: Suggestion[] = [];
  hits.forEach((hit) => {
    const suggestion: Suggestion = {
      suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
      action: 'consider',
      card: G.setCardToSuggestionCard(hit.card),
      quantity: 1,
      roles_matched: hit.rolesMatched,
      confidence: hit.confidence,
      rationale: hit.rationale,
      tags: ['rule:' + ruleId, ...hit.rolesMatched],
      replaces: [],
      priority_tier: 'normal',
      signals: hit.signals,
    };
    const emitted = G.emitIfValid(suggestion, profile, existing.concat(added), debug);
    if (emitted) added.push(emitted);
  });
  return added;
}
