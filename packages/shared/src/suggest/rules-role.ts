import type { DeckProfile, DeckRecord, SetPoolCard, SetScope, Suggestion, TaggerContext } from './types';
import * as G from './rule-guards';
import { cardTextBlob, countTagOverlap } from './signals';

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
): { roleId: string; score: number; hint: string } | null {
  const roles = G.normalizeProfile(profile).roles;
  let best: { roleId: string; score: number; hint: string } | null = null;
  roles.forEach((role) => {
    let overlap = countTagOverlap(setCard, role.tags || [], null);
    if (!overlap) {
      const roleId = normalizeText(role.id);
      if (roleId && cardTextBlob(setCard).indexOf(roleId) >= 0) {
        overlap = 1;
      }
    }
    if (!overlap) {
      return;
    }
    const score = overlap * 10 + priorityWeight(role.priority);
    if (!best || score > best.score) {
      best = { roleId: role.id, score, hint: (role.tags || []).slice(0, 2).join(', ') };
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
  const ownedNames = G.ownedNamesInSnapshot(deck);
  const codes: Record<string, boolean> = {};
  (setScope.codes || []).forEach((c) => {
    codes[String(c).toUpperCase()] = true;
  });

  (setScope.cards || []).forEach((setCard) => {
    const code = String(setCard.set_code || '').toUpperCase();
    if (!codes[code]) {
      return;
    }
    if (ownedNames[setCard.name.toLowerCase()]) {
      return;
    }
    if (!G.isColorIdentityLegal(setCard, deck)) {
      return;
    }
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
      signals: { tags: match.hint ? match.hint.split(', ') : [] },
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
