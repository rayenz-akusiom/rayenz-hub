import * as G from './rule-guards';
import type { DeckProfile, DeckRecord, SetScope, SnapshotCard, Suggestion, TaggerContext } from './types';

export function isProxyCard(card: SnapshotCard): boolean {
  const cats = card.categories || [];
  return cats.indexOf('Proxies') >= 0 || card.primary_category === 'Proxies';
}

function findOfficialInScope(proxyCard: SnapshotCard, setScope: SetScope): SetScope['cards'][0] | null {
  const name = proxyCard.name;
  const nameLower = String(name || '').toLowerCase();
  let matches: SetScope['cards'];
  if (setScope && setScope.cardsByName) {
    matches = (setScope.cardsByName[nameLower] || []).slice();
  } else {
    matches = (setScope.cards || []).filter((c) => c.name === name);
  }
  if (!matches.length) {
    return null;
  }
  matches.sort((a, b) => String(a.collector_number).localeCompare(String(b.collector_number)));
  return matches[0];
}

export function runProxyUpgrade(
  deck: DeckRecord,
  setScope: SetScope,
  profile: DeckProfile | undefined,
  existing: Suggestion[],
  _taggerCtx: TaggerContext,
  debug?: { ruleId?: string; collector?: { push: (e: Record<string, unknown>) => void } },
): Suggestion[] {
  const added: Suggestion[] = [];
  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((card) => {
    if (!isProxyCard(card)) {
      return;
    }
    const official = findOfficialInScope(card, setScope);
    if (!official) {
      if (debug && debug.collector) {
        debug.collector.push({
          ruleId: debug.ruleId || 'proxy_upgrade',
          outcome: 'skipped',
          subject: card.name,
          reason: 'proxy_no_official_in_scope',
        });
      }
      return;
    }
    const setCode = (official.set_code || setScope.primaryCode || '').toUpperCase();
    const suggestion: Suggestion = {
      suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
      action: 'replace',
      card: G.setCardToSuggestionCard(official),
      quantity: 1,
      roles_matched: ['proxy'],
      confidence: 'high',
      rationale: 'Proxy upgrade — official printing from ' + setCode + '.',
      tags: ['proxy', 'rule:proxy_upgrade'],
      replaces: [{ name: card.name || '', quantity: 1 }],
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

export const ProxyRules = {
  runProxyUpgrade,
  isProxyCard,
};
