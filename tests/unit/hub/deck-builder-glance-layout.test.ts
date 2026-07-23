import { describe, expect, it } from 'vitest';
import { buildGlanceIncludeSet, buildGlanceLayoutPlan, compareGlanceCardsForColourSort } from '@rayenz-hub/shared';
import { buildEligibleCommanderDeck } from '../../fixtures/deck-builder/glance-eligible.ts';

describe('deck-builder glance layout', () => {
  it('is deterministic for the same include-set', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const a = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const b = buildGlanceLayoutPlan(include.includeSet, deck.name);
    expect(a.placements).toEqual(b.placements);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.layoutVersion).toBe('glance-layout-2');
  });

  it('keeps lands in the land band only', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const landIds = new Set(include.includeSet.lands.map((c) => c.instanceId));
    for (const placement of plan.placements) {
      if (landIds.has(placement.card.instanceId)) {
        expect(placement.region).toBe('land');
      }
      if (placement.region === 'land') {
        expect(landIds.has(placement.card.instanceId)).toBe(true);
      }
    }
  });

  it('orders non-land placements by colour-sort within the nonland band', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const nonland = plan.placements.filter((p) => p.region === 'nonland').map((p) => p.card);
    const sorted = [...nonland].sort(compareGlanceCardsForColourSort);
    expect(nonland.map((c) => c.instanceId)).toEqual(sorted.map((c) => c.instanceId));
  });

  it('omits the lands band when there are no lands', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const noLands = {
      ...include.includeSet,
      lands: [],
      cards: include.includeSet.cards.filter((c) => !c.isLand),
      nonLands: include.includeSet.nonLands,
    };
    const plan = buildGlanceLayoutPlan(noLands, deck.name);
    expect(plan.placements.some((p) => p.region === 'land')).toBe(false);
  });

  it('fits a 100-card fixture within the canvas height', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const maxBottom = Math.max(...plan.placements.map((p) => p.y + p.height));
    expect(maxBottom + 48).toBeLessThanOrEqual(plan.canvasHeight);
  });
});