import { describe, expect, it } from 'vitest';
import { buildGlanceIncludeSet, buildGlanceLayoutPlan } from '@rayenz-hub/shared';
import {
  buildEligibleCommanderDeck,
  buildGlanceSwapCommanderDeck,
} from '../../fixtures/deck-builder/glance-eligible.ts';

describe('deck-builder glance roles and quantities', () => {
  it('extracts at most two commanders and lieutenants into dedicated role slots', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(include.includeSet.commanders.length).toBeLessThanOrEqual(2);
    expect(include.includeSet.lieutenants.length).toBeLessThanOrEqual(2);
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    expect(plan.placements.filter((p) => p.region === 'commander')).toHaveLength(1);
    const rolePlacements = plan.placements.filter(
      (p) => p.region === 'commander' || p.region === 'lieutenant',
    );
    expect(rolePlacements.every((p) => p.width === 213 && p.height === 297)).toBe(true);
  });

  it('shows quantity badges only for basic lands with quantity > 1', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    for (const placement of plan.placements) {
      if (placement.showQuantity) {
        expect(placement.card.isBasicLand).toBe(true);
        expect(placement.card.quantity).toBeGreaterThan(1);
      }
      if (placement.card.isBasicLand && placement.card.quantity > 1) {
        expect(placement.showQuantity).toBe(true);
      }
    }
  });

  it('applies swap ins while excluding outs for eligibility', () => {
    const deck = buildGlanceSwapCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(include.includeSet.quantitySum).toBe(100);
    expect(include.includeSet.cards.some((c) => c.instanceId === 'swap-in-1')).toBe(true);
    expect(include.includeSet.cards.some((c) => c.instanceId === 'spell-0')).toBe(false);
  });
});
