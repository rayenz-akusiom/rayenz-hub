import { describe, expect, it } from 'vitest';
import { assemblePackages, rankForBudgetPackaging } from '../../../packages/shared/src/suggest/package-assembler.ts';
import { setCardToSuggestionCard } from '../../../packages/shared/src/suggest/rule-guards.ts';
import { enrichSuggestionPrices } from '../../../packages/shared/src/suggest/upgrade-pool.ts';
import type { Suggestion } from '../../../packages/shared/src/suggest/types.ts';

function sug(
  id: string,
  name: string,
  usd: number | null,
  cut?: string,
  tier: 'normal' | 'swap' = 'normal',
  tags: string[] = [],
  roles: string[] = [],
): Suggestion {
  return {
    suggestion_id: id,
    action: 'swap',
    card: { name, ...(usd != null ? { usd } : {}) } as Suggestion['card'],
    quantity: 1,
    roles_matched: roles,
    confidence: 'medium',
    rationale: '',
    tags,
    replaces: cut ? [{ name: cut, quantity: 1 }] : [],
    priority_tier: tier,
    ...(usd != null ? { incomingUsd: usd } : {}),
  };
}

describe('assemblePackages', () => {
  it('fits suggestions within budget', () => {
    const suggestions = [sug('a', 'Card A', 5, 'Cut A', 'normal', ['removal'], ['removal'])];
    const { packages, audit } = assemblePackages(suggestions, { budgetUsd: 10 });
    expect(packages.length).toBeGreaterThan(0);
    expect(packages[0].totalUsd).toBeLessThanOrEqual(10);
    expect(audit.fittingPackageFound).toBe(true);
    expect(packages[0].focusTags.length).toBeGreaterThan(0);
  });

  it('skips overlapping cuts', () => {
    const suggestions = [
      sug('a', 'Card A', 3, 'Shared Cut', 'normal', ['removal'], ['removal']),
      sug('b', 'Card B', 3, 'Shared Cut', 'normal', ['removal'], ['removal']),
    ];
    const { packages } = assemblePackages(suggestions, { budgetUsd: 20 });
    expect(packages[0]?.swapCount).toBe(1);
  });

  it('respects maxSwaps', () => {
    const suggestions = [
      sug('a', 'A', 2, 'Cut 1', 'normal', ['ramp'], ['ramp']),
      sug('b', 'B', 2, 'Cut 2', 'normal', ['ramp'], ['ramp']),
      sug('c', 'C', 2, 'Cut 3', 'normal', ['ramp'], ['ramp']),
    ];
    const { packages } = assemblePackages(suggestions, { budgetUsd: 20, maxSwaps: 2 });
    expect(packages[0]?.swapCount).toBe(2);
  });

  it('builds non-overlapping packages with distinct focus tags', () => {
    const suggestions = [
      sug('a', 'Removal A', 8, 'Cut A', 'normal', ['removal'], ['removal']),
      sug('b', 'Removal B', 7, 'Cut B', 'normal', ['removal'], ['removal']),
      sug('c', 'Ramp A', 6, 'Cut C', 'normal', ['ramp'], ['ramp']),
      sug('d', 'Ramp B', 5, 'Cut D', 'normal', ['ramp'], ['ramp']),
      sug('e', 'Draw A', 4, 'Cut E', 'normal', ['card-draw'], ['card-draw']),
      sug('f', 'Draw B', 3, 'Cut F', 'normal', ['card-draw'], ['card-draw']),
    ];
    const { packages } = assemblePackages(suggestions, { budgetUsd: 20, maxSwaps: 2 });
    expect(packages.length).toBeGreaterThanOrEqual(2);
    const allIds = packages.flatMap((pkg) => pkg.suggestionIds);
    expect(new Set(allIds).size).toBe(allIds.length);
    packages.forEach((pkg) => {
      expect(pkg.focusTags).toHaveLength(1);
      expect(pkg.label.toLowerCase()).not.toContain('synergy');
    });
  });

  it('partitions haste suggestions under functional themes not rule metadata', () => {
    const suggestions = [
      sug('a', 'Bolt', 3, 'Cut A', 'normal', ['rule:role_synergy', 'removal'], ['removal']),
      sug('b', 'Rock', 3, 'Cut B', 'normal', ['rule:role_synergy', 'ramp'], ['ramp']),
      sug('c', 'Draw', 3, 'Cut C', 'normal', ['rule:keyword_synergy', 'haste'], ['haste', 'card-draw']),
    ];
    const { packages } = assemblePackages(suggestions, { budgetUsd: 20, maxSwaps: 1 });
    expect(packages.length).toBeGreaterThanOrEqual(2);
    packages.forEach((pkg) => {
      expect(pkg.label.toLowerCase()).not.toContain('synergy');
      expect(pkg.label.toLowerCase()).not.toContain('haste');
    });
  });

  it('prefers higher-priced cards when quality is equal', () => {
    const suggestions = [
      sug('cheap', 'Cheap', 2, 'Cut 1', 'normal', ['removal'], ['removal']),
      sug('pricey', 'Pricey', 9, 'Cut 2', 'normal', ['removal'], ['removal']),
    ];
    const ranked = rankForBudgetPackaging(suggestions);
    expect(ranked[0]?.suggestion_id).toBe('pricey');
  });

  it('skips unknown-price cards when priced alternatives exist', () => {
    const suggestions = [
      sug('priced', 'Priced', 5, 'Cut A', 'normal', ['removal'], ['removal']),
      sug('unknown', 'Unknown', null, 'Cut B', 'normal', ['removal'], ['removal']),
    ];
    const { packages } = assemblePackages(suggestions, { budgetUsd: 20 });
    expect(packages[0]?.suggestionIds).toContain('priced');
    expect(packages[0]?.suggestionIds).not.toContain('unknown');
  });

  it('uses preassigned theme partitions when provided', () => {
    const removal = sug('a', 'Removal A', 8, 'Cut A', 'normal', ['removal'], ['removal']);
    const ramp = sug('b', 'Ramp A', 6, 'Cut B', 'normal', ['ramp'], ['ramp']);
    const partitions = new Map([
      ['removal', [removal]],
      ['ramp', [ramp]],
    ]);
    const { packages } = assemblePackages([removal, ramp], {
      budgetUsd: 20,
      maxSwaps: 1,
      preassignedThemes: ['removal', 'ramp'],
      partitions,
    });
    expect(packages).toHaveLength(2);
    expect(packages[0]?.focusTags).toEqual(['removal']);
    expect(packages[1]?.focusTags).toEqual(['ramp']);
  });
});

describe('upgrade price propagation', () => {
  it('copies usd through setCardToSuggestionCard and enrichSuggestionPrices', () => {
    const card = setCardToSuggestionCard({
      name: 'Feed the Swarm',
      set_code: 'CMR',
      collector_number: '1',
      usd: 3.5,
    });
    expect(card.usd).toBe(3.5);
    const suggestions: Suggestion[] = [
      {
        suggestion_id: 's1',
        action: 'consider',
        card,
        quantity: 1,
        roles_matched: ['removal'],
        confidence: 'medium',
        rationale: '',
        tags: ['removal'],
        replaces: [],
        priority_tier: 'normal',
      },
    ];
    enrichSuggestionPrices(suggestions);
    expect((suggestions[0] as { incomingUsd?: number }).incomingUsd).toBe(3.5);
  });
});
