import { deriveSwapQueue, type DeckWithSnapshot } from '@rayenz-hub/shared';
import { buildDeckRuleContext, ensureSetPoolIndexed, getDeckSwapQueue } from './data';
import { createCollector } from './debug';
import * as G from './rule-guards';
import { QueueRules } from './rules-queue';
import { ProxyRules } from './rules-proxy';
import { createContext, RoleRules } from './tagger';
import type { DeckRecord, SetScope, Suggestion } from './types';

const CONFIDENCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function sortSuggestions(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.slice().sort((a, b) => {
    const tierA = a.priority_tier === 'swap' ? 0 : 1;
    const tierB = b.priority_tier === 'swap' ? 0 : 1;
    if (tierA !== tierB) {
      return tierA - tierB;
    }
    const confA = CONFIDENCE_ORDER[a.confidence] != null ? CONFIDENCE_ORDER[a.confidence] : 9;
    const confB = CONFIDENCE_ORDER[b.confidence] != null ? CONFIDENCE_ORDER[b.confidence] : 9;
    if (confA !== confB) {
      return confA - confB;
    }
    return String(a.suggestion_id).localeCompare(String(b.suggestion_id));
  });
}

function getSwapQueue(deck: DeckRecord) {
  return getDeckSwapQueue(deck) ?? deriveSwapQueue(deck as DeckWithSnapshot);
}

export function buildSwapQueueAnalysis(deck: DeckRecord) {
  const queue = getSwapQueue(deck);
  if (!queue) {
    return null;
  }
  const unpairedIn: string[] = [];
  const unpairedOut: string[] = [];
  const inLen = queue.new_set_in.length;
  const outLen = queue.new_set_out.length;
  if (inLen > outLen) {
    queue.new_set_in.slice(outLen).forEach((c) => {
      unpairedIn.push(c.name);
    });
  } else if (outLen > inLen) {
    queue.new_set_out.slice(inLen).forEach((c) => {
      unpairedOut.push(c.name);
    });
  }
  return {
    new_set_in: queue.new_set_in.map((c) => c.name),
    new_set_out:
      outLen === 1 && queue.new_set_out[0]
        ? queue.new_set_out[0].name
        : queue.new_set_out.map((c) => c.name),
    metadata_flags: queue.metadata_flags,
    in_count: inLen,
    out_count: outLen,
    unpaired_in: unpairedIn.length ? unpairedIn : null,
    unpaired_out: unpairedOut.length ? unpairedOut : null,
    reconciliation_notes: unpairedIn.map((name) => name + ': no Out paired — cut suggested from main deck'),
  };
}

export function runRulesForDeck(
  deck: DeckRecord,
  setScope: SetScope,
  options: {
    existingSuggestions?: Suggestion[];
    debug?: boolean;
  } = {},
) {
  ensureSetPoolIndexed(setScope);
  buildDeckRuleContext(deck);
  G.cutCandidates(deck);
  const profile = deck.profile || {};
  const existing = (options.existingSuggestions || []).slice();
  let suggestions = existing.slice();
  const audit: Array<Record<string, unknown>> = [];
  let collector: ReturnType<typeof createCollector> | null = null;
  if (options.debug) {
    collector = createCollector(deck.deck_id);
  }
  const taggerCtx = createContext(deck, setScope);

  const rules = [
    { id: 'queue_in_pair', fn: QueueRules.runQueueInPair },
    { id: 'queue_out_fill', fn: QueueRules.runQueueOutFill },
    { id: 'proxy_upgrade', fn: ProxyRules.runProxyUpgrade },
    { id: 'role_synergy', fn: RoleRules.runRoleSynergy },
  ] as const;

  rules.forEach((rule) => {
    const before = suggestions.length;
    const ruleDebug = collector ? { ruleId: rule.id, collector: collector as { push: (e: Record<string, unknown>) => void } } : undefined;
    const raw = rule.fn(deck, setScope, profile, suggestions, taggerCtx, ruleDebug) || [];
    const added = (raw as { added?: Suggestion[] }).added != null ? (raw as { added: Suggestion[] }).added : (raw as Suggestion[]);
    const skipped = (raw as { skipped?: Array<{ name: string; reason: string }> }).skipped || [];
    suggestions = suggestions.concat(added);
    audit.push({
      ruleId: rule.id,
      deckId: deck.deck_id,
      suggestionsAdded: suggestions.length - before,
    });
    skipped.forEach((slot) => {
      audit.push({
        ruleId: rule.id,
        deckId: deck.deck_id,
        suggestionsAdded: 0,
        skippedReason: slot.name + ' (' + slot.reason + ')',
      });
      if (collector) {
        collector.push({
          ruleId: rule.id,
          outcome: 'skipped',
          subject: slot.name,
          reason: slot.reason,
        });
      }
    });
  });

  suggestions = sortSuggestions(suggestions);

  return {
    suggestions,
    audit,
    debugTrace: collector ? collector.entries() : null,
    taggerCoverage: taggerCtx.coverage,
    analysis: {
      swap_queue: buildSwapQueueAnalysis(deck),
    },
  };
}
