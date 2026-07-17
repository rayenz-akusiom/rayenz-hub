import { deriveSwapQueue, type DeckWithSnapshot } from '@rayenz-hub/shared';
import { getDeckSwapQueue } from './data';
import * as G from './rule-guards';
import { matchSetCardToRoles } from './tagger';
import type { DeckProfile, DeckRecord, SetScope, SnapshotCard, Suggestion, TaggerContext } from './types';

function getSwapQueue(deck: DeckRecord) {
  return getDeckSwapQueue(deck) ?? deriveSwapQueue(deck as DeckWithSnapshot);
}

function inCardIsLand(inCard: { name?: string; type_line?: string }): boolean {
  const typeLine = inCard.type_line || '';
  if (/land/i.test(typeLine)) {
    return true;
  }
  return /\b(Plains|Island|Swamp|Mountain|Forest|Verge|Foundry|Tower|Steppe|Catacombs|Graveyard|Tomb)\b/i.test(
    inCard.name || '',
  );
}

export function pickCutForUnpairedIn(
  deck: DeckRecord,
  profile: DeckProfile | undefined,
  taggerCtx: TaggerContext,
  inCard: { name?: string; type_line?: string },
): SnapshotCard | null {
  let candidates = G.cutCandidates(deck);
  if (inCardIsLand(inCard)) {
    const lands = candidates.filter(
      (c) =>
        c.primary_category === 'Land' ||
        /land/i.test(c.type_line || '') ||
        /\b(Plains|Island|Swamp|Mountain|Forest|Verge|Foundry|Tower|Steppe)\b/i.test(c.name || ''),
    );
    if (lands.length) {
      candidates = lands;
    }
  }
  const ranked = G.rankCutCandidates(candidates, profile, taggerCtx);
  return ranked[0] || null;
}

export function runQueueInPair(
  deck: DeckRecord,
  setScope: SetScope,
  profile: DeckProfile | undefined,
  existing: Suggestion[],
  taggerCtx: TaggerContext,
  debug?: { ruleId?: string; collector?: { push: (e: Record<string, unknown>) => void } },
): { added: Suggestion[]; skipped: Array<{ name: string; reason: string }> } {
  const added: Suggestion[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const queue = getSwapQueue(deck);
  if (!queue) {
    if (debug && debug.collector) {
      debug.collector.push({
        ruleId: debug.ruleId || 'queue_in_pair',
        outcome: 'info',
        subject: deck.deck_name || deck.deck_id,
        reason: 'no_swap_queue',
      });
    }
    return { added, skipped };
  }
  const inCards = queue.new_set_in || [];
  const outCards = queue.new_set_out || [];
  const pairCount = Math.min(inCards.length, outCards.length);
  const setCode = (setScope.primaryCode || setScope.codes[0] || '').toUpperCase();

  for (let i = 0; i < pairCount; i += 1) {
    const inCard = inCards[i];
    const outCard = outCards[i];
    const resolvedIn = G.resolveQueuedInForScope(inCard, setScope);
    if (!resolvedIn) {
      skipped.push({ name: inCard.name, reason: 'not_in_set_scope' });
      continue;
    }
    const suggestion: Suggestion = {
      suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
      action: 'replace',
      card: resolvedIn,
      quantity: 1,
      roles_matched: ['swap'],
      confidence: 'high',
      rationale: 'Queued add — paired with ' + outCard.name + ' cut (' + setCode + ' printing).',
      tags: ['swap', 'rule:queue_in_pair'],
      replaces: [{ name: outCard.name, quantity: 1 }],
      fills_swap_slot: inCard.name,
      priority_tier: 'swap',
      swap_source: 'queue_in',
    };
    const emitted = G.emitIfValid(suggestion, profile, existing.concat(added), debug);
    if (emitted) {
      added.push(emitted);
    }
  }

  for (let j = pairCount; j < inCards.length; j += 1) {
    const unpairedIn = inCards[j];
    const resolvedUnpaired = G.resolveQueuedInForScope(unpairedIn, setScope);
    if (!resolvedUnpaired) {
      skipped.push({ name: unpairedIn.name, reason: 'not_in_set_scope' });
      continue;
    }
    const cut = pickCutForUnpairedIn(deck, profile, taggerCtx, unpairedIn);
    if (!cut) {
      if (debug && debug.collector) {
        debug.collector.push({
          ruleId: debug.ruleId || 'queue_in_pair',
          outcome: 'skipped',
          subject: unpairedIn.name,
          reason: 'no_cut_candidate',
        });
      }
      continue;
    }
    const unpairedSuggestion: Suggestion = {
      suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
      action: 'replace',
      card: resolvedUnpaired,
      quantity: 1,
      roles_matched: ['swap'],
      confidence: 'high',
      rationale:
        'Queued add — no Out paired; cut suggested from main deck (' + setCode + ' printing).',
      tags: ['swap', 'rule:queue_in_pair'],
      replaces: [{ name: cut.name || '', quantity: 1 }],
      fills_swap_slot: unpairedIn.name,
      priority_tier: 'swap',
      swap_source: 'queue_in',
    };
    const unpairedEmitted = G.emitIfValid(unpairedSuggestion, profile, existing.concat(added));
    if (unpairedEmitted) {
      added.push(unpairedEmitted);
    }
  }

  return { added, skipped };
}

export function findSetReplacement(
  deck: DeckRecord,
  _outCard: { name: string },
  setScope: SetScope,
  profile: DeckProfile | undefined,
  _taggerCtx: TaggerContext,
): { setCard: SetScope['cards'][number]; match: { roleId: string; score: number; hint: string } } | null {
  const deckNames = G.deckNamesInSnapshot(deck);
  let best: { setCard: SetScope['cards'][number]; match: { roleId: string; score: number; hint: string } } | null =
    null;
  (setScope.cards || []).forEach((setCard) => {
    if (deckNames[setCard.name.toLowerCase()]) {
      return;
    }
    const match = matchSetCardToRoles(setCard, profile);
    if (!match) {
      return;
    }
    if (!best || match.score > best.match.score) {
      best = { setCard, match };
    }
  });
  return best;
}

export function runQueueOutFill(
  deck: DeckRecord,
  setScope: SetScope,
  profile: DeckProfile | undefined,
  existing: Suggestion[],
  taggerCtx: TaggerContext,
  debug?: { ruleId?: string; collector?: { push: (e: Record<string, unknown>) => void } },
): Suggestion[] {
  const added: Suggestion[] = [];
  const queue = getSwapQueue(deck);
  if (!queue) {
    return added;
  }
  const inCards = queue.new_set_in || [];
  const outCards = queue.new_set_out || [];
  if (outCards.length <= inCards.length) {
    if (debug && debug.collector && outCards.length) {
      debug.collector.push({
        ruleId: debug.ruleId || 'queue_out_fill',
        outcome: 'info',
        subject: deck.deck_name || deck.deck_id,
        reason: 'queue_out_not_applicable',
        detail: 'In: ' + inCards.length + ', Out: ' + outCards.length,
      });
    }
    return added;
  }

  for (let i = inCards.length; i < outCards.length; i += 1) {
    const outCard = outCards[i];
    const replacement = findSetReplacement(deck, outCard, setScope, profile, taggerCtx);
    if (!replacement) {
      if (debug && debug.collector) {
        debug.collector.push({
          ruleId: debug.ruleId || 'queue_out_fill',
          outcome: 'skipped',
          subject: outCard.name,
          reason: 'queue_out_no_replacement',
        });
      }
      continue;
    }
    const setCode = (setScope.primaryCode || setScope.codes[0] || '').toUpperCase();
    const suggestion: Suggestion = {
      suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
      action: 'replace',
      card: G.setCardToSuggestionCard(replacement.setCard),
      quantity: 1,
      roles_matched: [replacement.match.roleId],
      confidence: 'high',
      rationale: 'Queued cut — suggested replacement from ' + setCode + '.',
      tags: ['swap', 'rule:queue_out_fill'],
      replaces: [{ name: outCard.name, quantity: 1 }],
      priority_tier: 'swap',
      swap_source: 'queue_out_fill',
    };
    const emitted = G.emitIfValid(suggestion, profile, existing.concat(added), debug);
    if (emitted) {
      added.push(emitted);
    }
  }

  return added;
}

export const QueueRules = {
  runQueueInPair,
  runQueueOutFill,
  pickCutForUnpairedIn,
  findSetReplacement,
};
