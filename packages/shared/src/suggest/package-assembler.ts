import { effectiveMaxSwaps } from './suggest-limits';
import type { Suggestion } from './types';

export type ChangePackage = {
  packageId: string;
  label: string;
  totalUsd: number;
  swapCount: number;
  unknownPriceCount: number;
  suggestionIds: string[];
  focusTags: string[];
};

export type PackagingAudit = {
  budgetUsd: number;
  fittingPackageFound: boolean;
  suggestionsPriced: number;
  suggestionsUnknownPrice: number;
  poolCardCount?: number;
};

export type AssemblePackagesOptions = {
  budgetUsd: number;
  maxSwaps?: number;
  excludeOwned?: boolean;
  ownedNames?: Set<string>;
};

const CONFIDENCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const TARGET_PACKAGE_COUNT = 3;
const SPEND_TARGET_RATIO = 0.85;

function incomingUsd(s: Suggestion): number | null {
  const raw = (s as { incomingUsd?: number }).incomingUsd;
  if (raw == null || !Number.isFinite(raw)) return null;
  return raw;
}

function cutName(s: Suggestion): string | null {
  const rep = s.replaces && s.replaces[0];
  return rep?.name ? String(rep.name) : null;
}

function isBasicLandName(name: string): boolean {
  const n = name.toLowerCase();
  return ['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes', 'snow-covered plains',
    'snow-covered island', 'snow-covered swamp', 'snow-covered mountain', 'snow-covered forest'].includes(n);
}

/** Budget packaging rank: quality first, then price descending. */
export function rankForBudgetPackaging(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.slice().sort((a, b) => {
    const tierA = a.priority_tier === 'swap' ? 0 : 1;
    const tierB = b.priority_tier === 'swap' ? 0 : 1;
    if (tierA !== tierB) return tierA - tierB;
    const confA = CONFIDENCE_ORDER[a.confidence] != null ? CONFIDENCE_ORDER[a.confidence] : 9;
    const confB = CONFIDENCE_ORDER[b.confidence] != null ? CONFIDENCE_ORDER[b.confidence] : 9;
    if (confA !== confB) return confA - confB;
    const scoreA = a.match_score != null ? a.match_score : 0;
    const scoreB = b.match_score != null ? b.match_score : 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    const priceA = incomingUsd(a) ?? 0;
    const priceB = incomingUsd(b) ?? 0;
    if (priceA !== priceB) return priceB - priceA;
    return String(a.suggestion_id).localeCompare(String(b.suggestion_id));
  });
}

function focusKeysForSuggestion(s: Suggestion): string[] {
  const keys = new Set<string>();
  (s.roles_matched || []).forEach((k) => {
    if (k) keys.add(String(k));
  });
  (s.tags || []).forEach((t) => {
    if (t) keys.add(String(t));
  });
  (s.signals?.tags || []).forEach((t) => {
    if (t) keys.add(String(t));
  });
  return [...keys];
}

function suggestionMatchesFocus(s: Suggestion, focusTags: string[]): boolean {
  if (!focusTags.length) return true;
  const keys = new Set(focusKeysForSuggestion(s));
  return focusTags.some((f) => keys.has(f));
}

function formatFocusLabel(focusTags: string[]): string {
  const readable = focusTags.map((t) => {
    if (t.startsWith('rule:')) {
      return t.slice(5).replace(/_/g, ' ');
    }
    return t.replace(/-/g, ' ');
  });
  return readable.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' + ');
}

type FocusCluster = { key: string; count: number; score: number };

function buildFocusClusters(ranked: Suggestion[]): FocusCluster[] {
  const map = new Map<string, { count: number; score: number }>();
  ranked.forEach((s, idx) => {
    const weight = ranked.length - idx;
    focusKeysForSuggestion(s).forEach((key) => {
      const cur = map.get(key) || { count: 0, score: 0 };
      cur.count += 1;
      cur.score += weight;
      map.set(key, cur);
    });
  });
  return [...map.entries()]
    .map(([key, v]) => ({ key, count: v.count, score: v.score }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.key.localeCompare(b.key));
}

function pickFocusPairs(clusters: FocusCluster[], targetCount: number): string[][] {
  const pairs: string[][] = [];
  const used = new Set<string>();
  const keys = clusters.map((c) => c.key);

  for (const primary of keys) {
    if (pairs.length >= targetCount) break;
    if (used.has(primary)) continue;
    let partner: string | null = null;
    for (const candidate of keys) {
      if (candidate === primary || used.has(candidate)) continue;
      partner = candidate;
      break;
    }
    if (partner) {
      pairs.push([primary, partner]);
      used.add(primary);
      used.add(partner);
    } else if (!used.has(primary)) {
      pairs.push([primary]);
      used.add(primary);
    }
  }

  return pairs;
}

function passesFilters(
  s: Suggestion,
  options: AssemblePackagesOptions,
  owned: Set<string>,
  usedCuts: Set<string>,
  usedSuggestionIds: Set<string>,
  allowUnknownPrice: boolean,
): boolean {
  if (usedSuggestionIds.has(s.suggestion_id)) return false;
  const name = s.card?.name ? String(s.card.name) : '';
  if (options.excludeOwned && name && owned.has(name.toLowerCase())) return false;
  const usd = incomingUsd(s);
  if (usd == null && !allowUnknownPrice) return false;
  const cut = cutName(s);
  if (cut && usedCuts.has(cut) && !isBasicLandName(cut)) return false;
  return true;
}

function packageTotal(selected: Suggestion[]): number {
  return selected.reduce((n, s) => n + (incomingUsd(s) ?? 0), 0);
}

function fillPackage(
  ranked: Suggestion[],
  focusTags: string[],
  options: AssemblePackagesOptions,
  maxSwaps: number,
  owned: Set<string>,
  usedCuts: Set<string>,
  usedSuggestionIds: Set<string>,
): Suggestion[] {
  const scoped = ranked.filter((s) => suggestionMatchesFocus(s, focusTags));
  const hasPriced = scoped.some((s) => incomingUsd(s) != null);
  const allowUnknown = !hasPriced;

  const selected: Suggestion[] = [];
  const localCuts = new Set(usedCuts);
  let total = 0;

  for (const s of scoped) {
    if (selected.length >= maxSwaps) break;
    if (!passesFilters(s, options, owned, localCuts, usedSuggestionIds, allowUnknown)) continue;
    const usd = incomingUsd(s);
    const price = usd ?? 0;
    if (usd != null && total + price > options.budgetUsd) continue;
    selected.push(s);
    if (usd != null) total += price;
    const cut = cutName(s);
    if (cut) localCuts.add(cut);
  }

  if (selected.length && total < options.budgetUsd * SPEND_TARGET_RATIO) {
    const selectedIds = new Set(selected.map((s) => s.suggestion_id));
    for (let i = 0; i < selected.length; i += 1) {
      const current = selected[i];
      const currentPrice = incomingUsd(current) ?? 0;
      let bestUpgrade: Suggestion | null = null;
      let bestPrice = currentPrice;
      for (const candidate of scoped) {
        if (selectedIds.has(candidate.suggestion_id)) continue;
        if (!passesFilters(candidate, options, owned, localCuts, usedSuggestionIds, allowUnknown)) continue;
        const candidatePrice = incomingUsd(candidate);
        if (candidatePrice == null) continue;
        const newTotal = total - currentPrice + candidatePrice;
        if (candidatePrice <= currentPrice || newTotal > options.budgetUsd) continue;
        if (candidatePrice > bestPrice) {
          bestUpgrade = candidate;
          bestPrice = candidatePrice;
        }
      }
      if (bestUpgrade) {
        total = total - currentPrice + bestPrice;
        selectedIds.delete(current.suggestion_id);
        selectedIds.add(bestUpgrade.suggestion_id);
        selected[i] = bestUpgrade;
      }
    }
  }

  selected.forEach((s) => {
    usedSuggestionIds.add(s.suggestion_id);
    const cut = cutName(s);
    if (cut) usedCuts.add(cut);
  });

  return selected;
}

export function assemblePackages(
  suggestions: Suggestion[],
  options: AssemblePackagesOptions,
): { packages: ChangePackage[]; audit: PackagingAudit } {
  const budgetUsd = options.budgetUsd;
  const maxSwaps = effectiveMaxSwaps(options.maxSwaps);
  const owned = options.ownedNames || new Set<string>();
  const ranked = rankForBudgetPackaging(suggestions);

  let priced = 0;
  let unknown = 0;
  ranked.forEach((s) => {
    const usd = incomingUsd(s);
    if (usd != null) priced += 1;
    else unknown += 1;
  });

  const clusters = buildFocusClusters(ranked);
  const focusPairs = pickFocusPairs(clusters, TARGET_PACKAGE_COUNT);
  const usedSuggestionIds = new Set<string>();
  const usedCuts = new Set<string>();
  const packages: ChangePackage[] = [];

  focusPairs.forEach((focusTags, idx) => {
    const selected = fillPackage(ranked, focusTags, options, maxSwaps, owned, usedCuts, usedSuggestionIds);
    if (!selected.length) return;
    const total = packageTotal(selected);
    const unknownInPkg = selected.filter((s) => incomingUsd(s) == null).length;
    packages.push({
      packageId: `pkg-${idx + 1}`,
      label: formatFocusLabel(focusTags),
      totalUsd: total,
      swapCount: selected.length,
      unknownPriceCount: unknownInPkg,
      suggestionIds: selected.map((s) => s.suggestion_id),
      focusTags,
    });
  });

  const anyFitting = packages.some((p) => p.totalUsd > 0 && p.totalUsd <= budgetUsd);

  return {
    packages,
    audit: {
      budgetUsd,
      fittingPackageFound: packages.length > 0 && anyFitting,
      suggestionsPriced: priced,
      suggestionsUnknownPrice: unknown,
    },
  };
}
