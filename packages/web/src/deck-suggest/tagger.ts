import type { DeckProfile, DeckRecord, SetPoolCard, SetScope, SnapshotCard, Suggestion, TaggerContext } from './types';
import * as G from './rule-guards';

function normalizeText(value: string | null | undefined): string {
  return String(value || '').toLowerCase();
}

function cardTextBlob(card: SnapshotCard | SetPoolCard | { name?: string; type_line?: string; oracle_text?: string; keywords?: string[] }): string {
  return normalizeText([card.type_line, card.oracle_text, (card.keywords || []).join(' ')].join(' '));
}

export function countTagOverlap(
  card: SnapshotCard | SetPoolCard,
  tags: string[] | undefined,
  taggerCtx: TaggerContext | null | undefined,
): number {
  if (!tags || !tags.length) {
    return 0;
  }
  const resolved = taggerCtx && taggerCtx.resolve ? taggerCtx.resolve(card.name || '', card) : null;
  const blob = cardTextBlob(card);
  const taggerTags = (resolved && resolved.taggerTags) || [];
  let count = 0;
  tags.forEach((tag) => {
    const t = normalizeText(tag);
    if (!t) {
      return;
    }
    if (
      taggerTags.some(
        (tt) => normalizeText(tt) === t || normalizeText(tt).indexOf(t) >= 0,
      )
    ) {
      count += 1;
      return;
    }
    if (blob.indexOf(t) >= 0) {
      count += 1;
    }
  });
  return count;
}

export function resolveCardTags(cardName: string, card?: SnapshotCard | SetPoolCard) {
  const tags: string[] = [];
  const keywords = (card && card.keywords) || [];
  keywords.forEach((k) => {
    if (tags.indexOf(k) < 0) {
      tags.push(k);
    }
  });
  if (card && card.type_line) {
    card.type_line
      .split(/[—\-]/)
      .slice(1)
      .join(' ')
      .split(/\s+/)
      .forEach((part) => {
        const p = part.replace(/[^a-zA-Z]/g, '');
        if (p.length > 2 && tags.indexOf(p) < 0) {
          tags.push(p);
        }
      });
  }
  return {
    cardName,
    taggerTags: tags,
    source: tags.length ? 'fallback' : 'fallback',
  };
}

export function createContext(deck: DeckRecord, setScope: SetScope | null): TaggerContext {
  const cache: TaggerContext['cache'] = {};
  let withTags = 0;
  let total = 0;

  function resolve(name: string, card?: SnapshotCard | SetPoolCard) {
    const key = normalizeText(name);
    if (!cache[key]) {
      cache[key] = resolveCardTags(name, card);
    }
    return cache[key];
  }

  function track(name: string, card?: SnapshotCard | SetPoolCard) {
    total += 1;
    const res = resolve(name, card);
    if (res.taggerTags && res.taggerTags.length) {
      withTags += 1;
    }
  }

  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((c) => {
    track(c.name || '', c);
  });
  ((setScope && setScope.cards) || []).forEach((c) => {
    track(c.name, c);
  });

  return {
    resolve,
    cache,
    coverage: {
      cardsResolved: total,
      cardsWithTags: withTags,
      percent: total ? Math.round((withTags / total) * 100) : 0,
    },
  };
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
  const deckNames = G.deckNamesInSnapshot(deck);
  const codes: Record<string, boolean> = {};
  (setScope.codes || []).forEach((c) => {
    codes[String(c).toUpperCase()] = true;
  });

  (setScope.cards || []).forEach((setCard) => {
    const code = String(setCard.set_code || '').toUpperCase();
    if (!codes[code]) {
      return;
    }
    if (deckNames[setCard.name.toLowerCase()]) {
      return;
    }
    const match = matchSetCardToRoles(setCard, profile);
    if (!match) {
      return;
    }
    const cut = G.pickBestCut(deck, profile, taggerCtx);
    if (!cut) {
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
      replaces: [{ name: cut.name || '', quantity: 1 }],
      priority_tier: 'normal',
      swap_source: 'analysis',
    };
    const emitted = G.emitIfValid(suggestion, profile, existing.concat(added), debug);
    if (emitted) {
      added.push(emitted);
    }
  });

  return added;
}

export const Tagger = {
  countTagOverlap,
  resolveCardTags,
  createContext,
  matchSetCardToRoles,
};

export const RoleRules = {
  runRoleSynergy,
};
