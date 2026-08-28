import type { DeckProfile, DeckRecord, SetPoolCard, SetScope, Suggestion, TaggerContext } from './types';
import * as G from './rule-guards';
import { hasScryfallOracleTags, matchTagNeedles, oracleTextForFallback, textMatchesNeedle } from './signals';
import { eligibleSetCards } from './synergy-emit';

function normalizeText(value: string | null | undefined): string {
  return String(value || '').toLowerCase();
}

function priorityWeight(priority?: string): number {
  if (priority === 'high') {
    return 3;
  }
  if (priority === 'medium') {
    return 2;
  }
  return 1;
}

export function matchSetCardToRoles(
  setCard: SetPoolCard,
  profile?: DeckProfile | null,
): { roleId: string; score: number; hint: string; matched: string[] } | null {
  const roles = G.normalizeProfile(profile).roles;
  let best: { roleId: string; score: number; hint: string; matched: string[] } | null = null;
  roles.forEach((role) => {
    const hit = matchTagNeedles(setCard, role.tags || []);
    let overlap = hit.count;
    let matched = hit.matched.slice();
    if (!overlap && !hasScryfallOracleTags(setCard)) {
      const roleId = normalizeText(role.id);
      if (roleId && textMatchesNeedle(oracleTextForFallback(setCard), roleId)) {
        overlap = 1;
        matched = [role.id];
      }
    }
    if (!overlap) {
      return;
    }
    const score = overlap * 10 + priorityWeight(role.priority);
    if (!best || score > best.score) {
      best = { roleId: role.id, score, hint: matched.join(', '), matched };
    }
  });
  return best;
}

export function runRoleSynergy(
  deck: DeckRecord,
  setScope: SetScope,
  profile: DeckProfile | undefined,
  existing: Suggestion[],
  taggerCtx: TaggerContext,
  debug?: { ruleId?: string; collector?: { push: (e: Record<string, unknown>) => void } },
): Suggestion[] {
  const added: Suggestion[] = [];

  eligibleSetCards(deck, setScope, profile, taggerCtx.focusTags).forEach((setCard) => {
    const match = matchSetCardToRoles(setCard, profile);
    if (!match) {
      return;
    }
    const confidence = match.score >= 13 ? 'medium' : 'low';
    const suggestion: Suggestion = {
      suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
      action: 'consider',
      card: G.setCardToSuggestionCard(setCard),
      quantity: 1,
      roles_matched: [match.roleId],
      confidence,
      rationale: 'Role match (' + match.roleId + ') — ' + (match.hint || 'profile tags') + '.',
      tags: ['rule:role_synergy', match.roleId],
      replaces: [],
      priority_tier: 'normal',
      swap_source: 'analysis',
      match_score: match.score,
      signals: { tags: match.matched },
    };
    const emitted = G.emitIfValid(suggestion, profile, existing.concat(added), debug);
    if (emitted) {
      added.push(emitted);
    }
  });

  return added;
}

export const RoleRules = {
  runRoleSynergy,
  matchSetCardToRoles,
};
