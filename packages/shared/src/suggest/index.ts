import { deriveSwapQueue, type DeckWithSnapshot } from '@rayenz-hub/shared';
import { buildDeckRuleContext, ensureSetPoolIndexed, getDeckSwapQueue } from './deck-context';
import { createCollector } from './debug';
import { resolveDeckEligibility } from './eligibility';
import * as G from './rule-guards';
import { QueueRules } from './rules-queue';
import { ProxyRules } from './rules-proxy';
import { RoleRules, matchSetCardToRoles } from './rules-role';
import { runTypalSynergy } from './rules-typal';
import { runThemeSynergy } from './rules-theme';
import { runKeywordSynergy } from './rules-keyword';
import {
  createContext,
  countTagOverlap,
  resolveCardTags,
  cardTextBlob,
  cardStoredTags,
  hasScryfallOracleTags,
  tagSlugMatches,
} from './signals';
import {
  SUGGEST_PER_DECK_SOFT_CAP,
  SUGGEST_PER_RULE_SOFT_CAP,
  applySoftCap,
  dropLowConfidence,
} from './suggest-limits';
import type { Coverage, DeckRecord, PageDeckResult, RuleAudit, SetScope, Suggestion } from './types';

import './debug';

export {
  SUGGEST_PER_DECK_SOFT_CAP,
  SUGGEST_PER_RULE_SOFT_CAP,
  applySoftCap,
  dropLowConfidence,
} from './suggest-limits';

export const Tagger = {
  countTagOverlap,
  resolveCardTags,
  createContext,
  cardTextBlob,
  cardStoredTags,
  hasScryfallOracleTags,
  tagSlugMatches,
  matchSetCardToRoles,
};

const CONFIDENCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

function normalizeSuggestionCi(colours: string[] | undefined): string[] {
  const set = new Set<string>();
  for (const c of colours || []) {
    const u = String(c || '').trim().toUpperCase();
    if ((WUBRG as readonly string[]).includes(u)) set.add(u);
  }
  return WUBRG.filter((c) => set.has(c));
}

function colourIdentityBucket(colours: string[]): number {
  const norm = normalizeSuggestionCi(colours);
  if (norm.length === 1) return WUBRG.indexOf(norm[0] as (typeof WUBRG)[number]);
  if (norm.length >= 2) return 5;
  return 6;
}

function compareColourIdentity(a: string[] | undefined, b: string[] | undefined): number {
  const ciA = normalizeSuggestionCi(a);
  const ciB = normalizeSuggestionCi(b);
  const bucketA = colourIdentityBucket(ciA);
  const bucketB = colourIdentityBucket(ciB);
  if (bucketA !== bucketB) return bucketA - bucketB;
  if (bucketA === 5) {
    const keyA = ciA.join('');
    const keyB = ciB.join('');
    if (keyA.length !== keyB.length) return keyA.length - keyB.length;
    if (keyA !== keyB) return keyA.localeCompare(keyB);
  }
  return 0;
}

/** Soft-cap ranking: tier → confidence → match score → id (no colour — CI must not bias who survives). */
export function rankSuggestionsForCap(suggestions: Suggestion[]): Suggestion[] {
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
    const scoreA = a.match_score != null ? a.match_score : 0;
    const scoreB = b.match_score != null ? b.match_score : 0;
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return String(a.suggestion_id).localeCompare(String(b.suggestion_id));
  });
}

/** Display order: tier → colour identity (WUBRG) → confidence → id. */
export function sortSuggestions(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.slice().sort((a, b) => {
    const tierA = a.priority_tier === 'swap' ? 0 : 1;
    const tierB = b.priority_tier === 'swap' ? 0 : 1;
    if (tierA !== tierB) {
      return tierA - tierB;
    }
    const ciCmp = compareColourIdentity(
      a.card?.color_identity || a.card?.colorIdentity,
      b.card?.color_identity || b.card?.colorIdentity,
    );
    if (ciCmp !== 0) {
      return ciCmp;
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
  if (deck.ownership === 'theory') {
    return {
      new_set_in: [] as string[],
      new_set_out: [] as string[],
      metadata_flags: [] as string[],
      in_count: 0,
      out_count: 0,
      unpaired_in: null as string[] | null,
      unpaired_out: null as string[] | null,
      reconciliation_notes: ['Theory deck — swap queue ignored'],
    };
  }
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
    reconciliation_notes: unpairedIn.map((name) => name + ': no Out paired — pick a cut when accepting'),
  };
}

type RuleFn = (
  deck: DeckRecord,
  setScope: SetScope,
  profile: DeckRecord['profile'],
  existing: Suggestion[],
  taggerCtx: ReturnType<typeof createContext>,
  debug?: { ruleId?: string; collector?: { push: (e: Record<string, unknown>) => void } },
) => Suggestion[] | { added: Suggestion[]; skipped?: Array<{ name: string; reason: string }> };

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
  const audit: RuleAudit[] = [];
  let collector: ReturnType<typeof createCollector> | null = null;
  if (options.debug) {
    collector = createCollector(deck.deck_id);
  }
  const taggerCtx = createContext(deck, setScope);

  const rules: Array<{ id: string; fn: RuleFn }> = [
    { id: 'queue_in_pair', fn: QueueRules.runQueueInPair },
    { id: 'queue_out_fill', fn: QueueRules.runQueueOutFill },
    { id: 'proxy_upgrade', fn: ProxyRules.runProxyUpgrade },
    { id: 'typal_synergy', fn: runTypalSynergy },
    { id: 'theme_synergy', fn: runThemeSynergy },
    { id: 'keyword_synergy', fn: runKeywordSynergy },
    { id: 'role_synergy', fn: RoleRules.runRoleSynergy },
  ];

  const skipQueueRules = deck.ownership === 'theory';

  rules.forEach((rule) => {
    if (skipQueueRules && (rule.id === 'queue_in_pair' || rule.id === 'queue_out_fill')) {
      audit.push({
        ruleId: rule.id,
        deckId: deck.deck_id,
        suggestionsAdded: 0,
        skippedReason: '* (theory_deck)',
      });
      if (collector) {
        collector.push({
          ruleId: rule.id,
          outcome: 'skipped',
          subject: '*',
          reason: 'theory_deck',
        });
      }
      return;
    }
    const before = suggestions.length;
    const ruleDebug = collector ? { ruleId: rule.id, collector: collector as { push: (e: Record<string, unknown>) => void } } : undefined;
    const raw = rule.fn(deck, setScope, profile, suggestions, taggerCtx, ruleDebug) || [];
    const added = (raw as { added?: Suggestion[] }).added != null ? (raw as { added: Suggestion[] }).added : (raw as Suggestion[]);
    const skipped = (raw as { skipped?: Array<{ name: string; reason: string }> }).skipped || [];
    const capped = applySoftCap(added, SUGGEST_PER_RULE_SOFT_CAP, rankSuggestionsForCap);
    suggestions = suggestions.concat(capped);
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

  suggestions = sortSuggestions(
    applySoftCap(suggestions, SUGGEST_PER_DECK_SOFT_CAP, rankSuggestionsForCap),
  );

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

export function runRulesForPage(
  decks: Array<{ deck: DeckRecord; profile?: DeckRecord['profile'] }>,
  setScope: SetScope,
  options: { debug?: boolean } = {},
): { deckResults: PageDeckResult[]; taggerCoverage: Coverage } {
  ensureSetPoolIndexed(setScope);
  const deckResults: PageDeckResult[] = [];
  let coverage: Coverage = { cardsResolved: 0, cardsWithTags: 0, percent: 0 };

  decks.forEach(({ deck, profile }) => {
    if (profile) deck.profile = { ...(deck.profile || {}), ...profile };
    const eligibility = resolveDeckEligibility(deck);
    if (!eligibility.eligible) {
      deckResults.push({
        deckId: deck.deck_id,
        deckName: deck.deck_name,
        skipped: true,
        skipReason: eligibility.reason,
        message: eligibility.message,
        suggestions: [],
        audit: [],
      });
      return;
    }
    const output = runRulesForDeck(deck, setScope, { debug: options.debug });
    coverage = output.taggerCoverage;
    deckResults.push({
      deckId: deck.deck_id,
      deckName: deck.deck_name,
      skipped: false,
      suggestions: output.suggestions,
      audit: output.audit,
    });
  });

  return { deckResults, taggerCoverage: coverage };
}

export * from './types';
export * from './profile-parse';
export * from './eligibility';
export * from './deck-context';
export * from './rule-guards';
export { RuleGuards } from './rule-guards';
export * from './signals';
export * from './rules-queue';
export { QueueRules } from './rules-queue';
export * from './rules-proxy';
export { ProxyRules } from './rules-proxy';
export * from './rules-role';
export { RoleRules } from './rules-role';
export * from './rules-typal';
export * from './rules-theme';
export * from './rules-keyword';
export * from './debug';
export { Debug } from './debug';
export * from './missing-cards';
export * from './yaml-lists';
