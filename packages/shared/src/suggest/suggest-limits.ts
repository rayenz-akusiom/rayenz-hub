import type { Suggestion } from './types';

export const SUGGEST_PER_RULE_SOFT_CAP = 5;
export const SUGGEST_PER_DECK_SOFT_CAP = 10;

export function effectiveMaxSwaps(maxSwaps?: number): number {
  return maxSwaps != null && maxSwaps > 0 ? maxSwaps : SUGGEST_PER_DECK_SOFT_CAP;
}

/** Budget upgrade needs enough suggestions for several non-overlapping packages. */
export function budgetSuggestDeckCap(maxSwaps?: number): number {
  return Math.max(15, 3 * effectiveMaxSwaps(maxSwaps));
}

export function dropLowConfidence(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.filter((s) => s.confidence !== 'low');
}

export function applySoftCap(
  suggestions: Suggestion[],
  cap: number,
  sortFn: (suggestions: Suggestion[]) => Suggestion[],
): Suggestion[] {
  const sorted = sortFn(dropLowConfidence(suggestions));
  const high = sorted.filter((s) => s.confidence === 'high');
  if (high.length >= cap) {
    return high;
  }
  const rest = sorted.filter((s) => s.confidence !== 'high');
  return high.concat(rest.slice(0, Math.max(0, cap - high.length)));
}
