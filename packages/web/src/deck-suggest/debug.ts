import { deriveSwapQueue, type DeckWithSnapshot } from '@rayenz-hub/shared';
import {
  Debug as SharedDebug,
  findInSetPool,
  matchSetCardToRoles,
  ownedNamesInSnapshot,
  resolveQueuedInForScope,
} from '@rayenz-hub/shared/suggest';
import type { DebugEntry, DeckRecord, SetScope, SnapshotCard } from './types';

export {
  REASON_LABELS,
  createCollector,
  formatReason,
  rejectReason,
} from '@rayenz-hub/shared/suggest';

function normalizeName(name: string): string {
  return String(name || '').trim().toLowerCase();
}

function isProxyCard(card: SnapshotCard): boolean {
  const cats = card.categories || [];
  return cats.indexOf('Proxies') >= 0 || card.primary_category === 'Proxies';
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
      const resolved = resolveQueuedInForScope(inCard, setScope);
      if (!resolved) {
        push('queue_in_pair', 'not_in_set_scope', 'Queued In not found in set pool');
      } else if (outIdx >= 0 && inIdx === outIdx) {
        push('queue_in_pair', 'would_emit', 'Paired with Out slot ' + queue.new_set_out[outIdx].name);
      } else if (inIdx >= (queue.new_set_out || []).length) {
        push('queue_in_pair', 'would_emit', 'Unpaired In — pick a cut when accepting');
      }
    }
    if (outIdx >= 0 && inIdx < 0) {
      if (outIdx < (queue.new_set_in || []).length) {
        push('queue_out_fill', 'would_emit', 'Paired Out — handled by queue_in_pair');
      } else {
        const ownedNames = ownedNamesInSnapshot(deck);
        type QueueReplacement = {
          setCard: SetScope['cards'][number];
          match: { roleId: string; score: number; hint: string };
        };
        let best: QueueReplacement | null = null;
        for (const setCard of setScope.cards || []) {
          if (ownedNames[setCard.name.toLowerCase()]) {
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

  const poolCard = findInSetPool(name, setScope);
  const ownedNames = ownedNamesInSnapshot(deck);
  if (poolCard) {
    const codes: Record<string, boolean> = {};
    (setScope.codes || []).forEach((c) => {
      codes[String(c).toUpperCase()] = true;
    });
    const code = String(poolCard.set_code || '').toUpperCase();
    if (!codes[code]) {
      push('role_synergy', 'role_wrong_set', 'Printing set ' + code + ' not in scope');
    } else if (ownedNames[nameLower]) {
      push('role_synergy', 'role_already_in_deck', 'Already in deck snapshot');
    } else {
      const match = matchSetCardToRoles(poolCard, profile);
      if (!match) {
        push('role_synergy', 'role_no_match', 'No profile role/tag overlap');
      } else {
        push('role_synergy', 'would_emit', 'Role ' + match.roleId);
      }
    }
  }

  return lines;
}

export const Debug = {
  ...SharedDebug,
  explainCard,
};
