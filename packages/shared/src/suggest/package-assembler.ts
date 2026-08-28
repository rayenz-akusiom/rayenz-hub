import { rankSuggestionsForCap } from './index';
import type { Suggestion } from './types';

export type ChangePackage = {
  packageId: string;
  label: string;
  totalUsd: number;
  swapCount: number;
  unknownPriceCount: number;
  suggestionIds: string[];
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

export function assemblePackages(
  suggestions: Suggestion[],
  options: AssemblePackagesOptions,
): { packages: ChangePackage[]; audit: PackagingAudit } {
  const budgetUsd = options.budgetUsd;
  const maxSwaps = options.maxSwaps != null && options.maxSwaps > 0 ? options.maxSwaps : 99;
  const owned = options.ownedNames || new Set<string>();
  const ranked = rankSuggestionsForCap(suggestions);

  let priced = 0;
  let unknown = 0;
  ranked.forEach((s) => {
    const usd = incomingUsd(s);
    if (usd != null) priced += 1;
    else unknown += 1;
  });

  const fitting: Suggestion[] = [];
  const usedCuts = new Set<string>();
  let total = 0;

  for (const s of ranked) {
    if (fitting.length >= maxSwaps) break;
    const name = s.card?.name ? String(s.card.name) : '';
    if (options.excludeOwned && name && owned.has(name.toLowerCase())) continue;
    const usd = incomingUsd(s);
    const price = usd != null ? usd : 0;
    if (usd != null && total + price > budgetUsd) continue;
    const cut = cutName(s);
    if (cut && usedCuts.has(cut) && !isBasicLandName(cut)) continue;
    fitting.push(s);
    if (usd != null) total += price;
    if (cut) usedCuts.add(cut);
  }

  const packages: ChangePackage[] = [];
  if (fitting.length) {
    const unknownInPkg = fitting.filter((s) => incomingUsd(s) == null).length;
    const label = total < budgetUsd * 0.7 ? 'Essentials' : 'Full budget';
    packages.push({
      packageId: 'pkg-fitting',
      label,
      totalUsd: total,
      swapCount: fitting.length,
      unknownPriceCount: unknownInPkg,
      suggestionIds: fitting.map((s) => s.suggestion_id),
    });
  }

  const stretch: Suggestion[] = [];
  for (const s of ranked) {
    if (fitting.some((f) => f.suggestion_id === s.suggestion_id)) continue;
    if (stretch.length >= 2) break;
    stretch.push(s);
  }
  if (stretch.length) {
    const stretchTotal = stretch.reduce((n, s) => n + (incomingUsd(s) ?? 0), 0);
    packages.push({
      packageId: 'pkg-stretch',
      label: 'Stretch',
      totalUsd: stretchTotal,
      swapCount: stretch.length,
      unknownPriceCount: stretch.filter((s) => incomingUsd(s) == null).length,
      suggestionIds: stretch.map((s) => s.suggestion_id),
    });
  }

  return {
    packages,
    audit: {
      budgetUsd,
      fittingPackageFound: fitting.length > 0 && total <= budgetUsd,
      suggestionsPriced: priced,
      suggestionsUnknownPrice: unknown,
    },
  };
}
