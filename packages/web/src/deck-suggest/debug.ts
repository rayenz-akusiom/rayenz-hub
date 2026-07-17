import { deriveSwapQueue, type DeckWithSnapshot } from '@rayenz-hub/shared';
import * as G from './rule-guards';
import { pickCutForUnpairedIn } from './rules-queue';
import { createContext, matchSetCardToRoles } from './tagger';
import { isProxyCard } from './rules-proxy';
import type { DebugEntry, DeckProfile, DeckRecord, SetScope, Suggestion } from './types';

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
  return null;
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

export function explainCard(deck: DeckRecord, setScope: SetScope, cardName: string): DebugEntry[] {
  const profile = deck.profile || {};
  const name = String(cardName || '').trim();
  const lines: DebugEntry[] = [];
  if (!name) {
    return lines;
  }
  const nameLower = normalizeName(name);

  function push(
    ruleId: string,
    reason: string,
    detail: string,
    extra?: Partial<DebugEntry>,
  ) {
    lines.push(
      Object.assign(
        {
          ruleId,
          outcome: reason === 'would_emit' ? 'info' : 'skipped',
          subject: name,
          reason,
          detail: detail || '',
        },
        extra || {},
      ),
    );
  }

  const queue = deriveSwapQueue(deck as DeckWithSnapshot);
  if (!queue) {
    push('queue_in_pair', 'no_swap_queue', 'Deck has no Queued In/Out queue');
  } else {
    let inIdx = -1;
    let outIdx = -1;
    (queue.new_set_in || []).forEach((c, i) => {
      if (normalizeName(c.name) === nameLower) {
        inIdx = i;
      }
    });
    (queue.new_set_out || []).forEach((c, i) => {
      if (normalizeName(c.name) === nameLower) {
        outIdx = i;
      }
    });
    if (inIdx >= 0) {
      const inCard = queue.new_set_in[inIdx];
      const resolved = G.resolveQueuedInForScope(inCard, setScope);
      if (!resolved) {
        push('queue_in_pair', 'not_in_set_scope', 'Queued In not found in set pool');
      } else if (outIdx >= 0 && inIdx === outIdx) {
        push('queue_in_pair', 'would_emit', 'Paired with Out slot ' + queue.new_set_out[outIdx].name);
      } else if (inIdx >= (queue.new_set_out || []).length) {
        const taggerCtx = createContext(deck, setScope);
        const cut = pickCutForUnpairedIn(deck, profile, taggerCtx, inCard);
        if (!cut) {
          push('queue_in_pair', 'no_cut_candidate', 'Unpaired In — no cut candidate');
        } else {
          push('queue_in_pair', 'would_emit', 'Unpaired In — cut ' + cut.name, { cardOut: cut.name });
        }
      }
    }
    if (outIdx >= 0 && inIdx < 0) {
      if (outIdx < (queue.new_set_in || []).length) {
        push('queue_out_fill', 'would_emit', 'Paired Out — handled by queue_in_pair');
      } else {
        const deckNames = G.deckNamesInSnapshot(deck);
        type QueueReplacement = {
          setCard: SetScope['cards'][number];
          match: { roleId: string; score: number; hint: string };
        };
        let best: QueueReplacement | null = null;
        for (const setCard of setScope.cards || []) {
          if (deckNames[setCard.name.toLowerCase()]) {
            continue;
          }
          const match = matchSetCardToRoles(setCard, profile);
          if (!match) {
            continue;
          }
          if (!best || match.score > best.match.score) {
            best = { setCard, match };
          }
        }
        if (!best) {
          push('queue_out_fill', 'queue_out_no_replacement', 'Extra Out — no role-matched replacement in pool');
        } else {
          push('queue_out_fill', 'would_emit', 'Extra Out — replace with ' + best.setCard.name, {
            cardIn: best.setCard.name,
          });
        }
      }
    }
  }

  const snapshotCard = ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).find(
    (c) => normalizeName(c.name || '') === nameLower,
  );
  if (snapshotCard && isProxyCard(snapshotCard)) {
    let official: SetScope['cards'][0] | null = null;
    (setScope.cards || []).forEach((c) => {
      if (c.name === snapshotCard.name && !official) {
        official = c;
      }
    });
    if (!official) {
      push('proxy_upgrade', 'proxy_no_official_in_scope', 'Proxy has no printing in set pool');
    } else {
      push('proxy_upgrade', 'would_emit', 'Proxy upgrade to ' + (official as SetScope['cards'][0]).set_code);
    }
  }

  const poolCard = G.findInSetPool(name, setScope);
  const deckNames = G.deckNamesInSnapshot(deck);
  if (poolCard) {
    const codes: Record<string, boolean> = {};
    (setScope.codes || []).forEach((c) => {
      codes[String(c).toUpperCase()] = true;
    });
    const code = String(poolCard.set_code || '').toUpperCase();
    if (!codes[code]) {
      push('role_synergy', 'role_wrong_set', 'Printing set ' + code + ' not in scope');
    } else if (deckNames[nameLower]) {
      push('role_synergy', 'role_already_in_deck', 'Already in deck snapshot');
    } else {
      const match = matchSetCardToRoles(poolCard, profile);
      if (!match) {
        push('role_synergy', 'role_no_match', 'No profile role/tag overlap');
      } else {
        const taggerCtx = createContext(deck, setScope);
        const cut = G.pickBestCut(deck, profile, taggerCtx);
        if (!cut) {
          push('role_synergy', 'role_no_cut', 'Role match but no cut candidate');
        } else {
          push('role_synergy', 'would_emit', 'Role ' + match.roleId + ' — cut ' + cut.name, {
            cardOut: cut.name,
          });
        }
      }
    }
  }

  return lines;
}

G.registerRejectReason(rejectReason);

export const Debug = {
  createCollector,
  rejectReason,
  formatReason,
  explainCard,
  REASON_LABELS,
};
