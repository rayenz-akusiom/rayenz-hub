import type { DebugEntry, DeckProfile, Suggestion } from './types';
import * as G from './rule-guards';

export const REASON_LABELS: Record<string, string> = {
  not_in_set_scope: 'Card not in selected set pool',
  no_swap_queue: 'No Archidekt swap queue on deck snapshot',
  no_cut_candidate: 'No eligible main-deck cut found',
  blocked_add: 'Card is on profile blocklist (add)',
  protected_cut: 'Suggested cut is on profile protected list',
  duplicate_pair: 'Duplicate in/out pair already suggested',
  queue_out_no_replacement: 'No set-pool replacement matched profile roles',
  queue_out_not_applicable: 'Queue Out count does not exceed In count',
  proxy_not_proxy: 'Card is not in Proxies category',
  proxy_no_official_in_scope: 'No official printing in set pool for proxy',
  role_already_in_deck: 'Card already in deck',
  role_wrong_set: 'Printing not in selected set codes',
  role_no_match: 'No profile role/tag match',
  role_no_cut: 'No eligible cut for role suggestion',
  deck_ineligible: 'Deck skipped by eligibility rules',
  would_emit: 'Would produce a suggestion',
  constraint_max_cmc: 'Card exceeds profile max CMC',
  constraint_min_cmc: 'Card is below profile min CMC',
  constraint_avoid_tags: 'Card matches an avoided tag',
  color_identity: 'Card is outside commander color identity',
};

function normalizeName(name: string): string {
  return String(name || '').trim().toLowerCase();
}

export function createCollector(deckId: string) {
  const entries: DebugEntry[] = [];
  return {
    deckId,
    push(entry: DebugEntry) {
      entries.push(Object.assign({ deckId }, entry));
    },
    entries() {
      return entries.slice();
    },
    filterByCard(name: string) {
      const needle = normalizeName(name);
      if (!needle) {
        return entries.slice();
      }
      return entries.filter((entry) =>
        [entry.subject, entry.cardIn, entry.cardOut].some(
          (field) => field && normalizeName(field).indexOf(needle) >= 0,
        ),
      );
    },
  };
}

export function rejectReason(
  suggestion: Suggestion | null | undefined,
  profile: DeckProfile | undefined,
  existing: Suggestion[],
): string | null {
  if (!suggestion || !suggestion.card) {
    return 'invalid_suggestion';
  }
  if (!G.passesBlocklist(suggestion, profile)) {
    if (G.isBlockedAdd(suggestion.card.name, profile)) {
      return 'blocked_add';
    }
    return 'protected_cut';
  }
  if (G.hasDuplicate(existing, suggestion)) {
    return 'duplicate_pair';
  }
  return G.violatesConstraints(suggestion.card, profile);
}

export function formatReason(entry: DebugEntry): string {
  const label = REASON_LABELS[entry.reason || ''] || entry.reason || 'unknown';
  const parts: string[] = [];
  if (entry.ruleId) {
    parts.push('[' + entry.ruleId + ']');
  }
  if (entry.subject) {
    parts.push(entry.subject);
  }
  parts.push('— ' + label);
  if (entry.cardIn && entry.cardIn !== entry.subject) {
    parts.push('(in: ' + entry.cardIn + ')');
  }
  if (entry.cardOut) {
    parts.push('(cut: ' + entry.cardOut + ')');
  }
  if (entry.detail) {
    parts.push('— ' + entry.detail);
  }
  return parts.join(' ');
}

G.registerRejectReason(rejectReason);

export const Debug = {
  createCollector,
  rejectReason,
  formatReason,
  REASON_LABELS,
};
