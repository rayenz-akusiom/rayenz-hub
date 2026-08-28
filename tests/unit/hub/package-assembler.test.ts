import { describe, expect, it } from 'vitest';
import { assemblePackages } from '../../../packages/shared/src/suggest/package-assembler.ts';
import type { Suggestion } from '../../../packages/shared/src/suggest/types.ts';

function sug(
  id: string,
  name: string,
  usd: number | null,
  cut?: string,
  tier: 'normal' | 'swap' = 'normal',
): Suggestion {
  return {
    suggestion_id: id,
    action: 'swap',
    card: { name, usd } as Suggestion['card'],
    quantity: 1,
    roles_matched: [],
    confidence: 'medium',
    rationale: '',
    tags: [],
    replaces: cut ? [{ name: cut, quantity: 1 }] : [],
    priority_tier: tier,
    ...(usd != null ? { incomingUsd: usd } : {}),
  };
}

describe('assemblePackages', () => {
  it('fits suggestions within budget', () => {
    const suggestions = [sug('a', 'Card A', 5, 'Cut A'), sug('b', 'Card B', 8, 'Cut B')];
    const { packages, audit } = assemblePackages(suggestions, { budgetUsd: 10 });
    expect(packages.length).toBeGreaterThan(0);
    expect(packages[0].totalUsd).toBeLessThanOrEqual(10);
    expect(audit.fittingPackageFound).toBe(true);
  });

  it('skips overlapping cuts', () => {
    const suggestions = [
      sug('a', 'Card A', 3, 'Shared Cut'),
      sug('b', 'Card B', 3, 'Shared Cut'),
    ];
    const { packages } = assemblePackages(suggestions, { budgetUsd: 20 });
    expect(packages[0]?.swapCount).toBe(1);
  });

  it('respects maxSwaps', () => {
    const suggestions = [
      sug('a', 'A', 2, 'Cut 1'),
      sug('b', 'B', 2, 'Cut 2'),
      sug('c', 'C', 2, 'Cut 3'),
    ];
    const { packages } = assemblePackages(suggestions, { budgetUsd: 20, maxSwaps: 2 });
    expect(packages[0]?.swapCount).toBe(2);
  });

  it('packages only focus-matching normal-tier swaps when input is pre-filtered', () => {
    const focused = [
      sug('a', 'Ramp Rock', 4, 'Cut A'),
      sug('b', 'Other', 4, 'Cut B'),
    ];
    const { packages } = assemblePackages(focused, { budgetUsd: 20 });
    expect(packages[0]?.suggestionIds).toEqual(['a', 'b']);
    expect(packages[0]?.totalUsd).toBeLessThanOrEqual(20);
  });
});
