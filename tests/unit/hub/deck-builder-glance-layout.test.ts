import { describe, expect, it } from 'vitest';
import {
  buildGlanceIncludeSet,
  buildGlanceLayoutPlan,
  compareGlanceCardsForColourSort,
  GLANCE_CANVAS_HEIGHT,
  GLANCE_CANVAS_WIDTH,
  GLANCE_CARD_HEIGHT,
  GLANCE_CARD_WIDTH,
  GLANCE_GENERATION_VERSION,
  MIN_VISIBLE_Y,
} from '@rayenz-hub/shared';
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
    expect(a.labels).toEqual(b.labels);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.layoutVersion).toBe(GLANCE_GENERATION_VERSION);
  });

  it('uses a fixed 1920×1080 canvas', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    expect(plan.canvasWidth).toBe(GLANCE_CANVAS_WIDTH);
    expect(plan.canvasHeight).toBe(GLANCE_CANVAS_HEIGHT);
    expect(plan.canvasWidth).toBe(1920);
    expect(plan.canvasHeight).toBe(1080);
  });

  it('keeps commanders at M size and band tiles no larger than M', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    for (const placement of plan.placements) {
      expect(placement.width).toBeLessThanOrEqual(GLANCE_CARD_WIDTH);
      expect(placement.height).toBeLessThanOrEqual(GLANCE_CARD_HEIGHT);
      if (placement.region === 'commander' || placement.region === 'lieutenant') {
        expect(placement.width).toBe(GLANCE_CARD_WIDTH);
        expect(placement.height).toBe(GLANCE_CARD_HEIGHT);
      }
    }
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

  it('fans nonland cards vertically within columns using height-budget pitch', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const nonland = plan.placements.filter((p) => p.region === 'nonland');
    const byX = new Map<number, typeof nonland>();
    for (const p of nonland) {
      const list = byX.get(p.x) || [];
      list.push(p);
      byX.set(p.x, list);
    }
    let foundStackedColumn = false;
    for (const col of byX.values()) {
      if (col.length < 2) continue;
      foundStackedColumn = true;
      const sorted = [...col].sort((a, b) => a.y - b.y);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.x).toBe(sorted[0]!.x);
        const pitch = sorted[i]!.y - sorted[i - 1]!.y;
        expect(pitch).toBeGreaterThanOrEqual(MIN_VISIBLE_Y);
        expect(pitch).toBeLessThanOrEqual(sorted[0]!.height);
        expect(sorted[i]!.zIndex).toBeGreaterThan(sorted[i - 1]!.zIndex);
      }
    }
    expect(foundStackedColumn).toBe(true);
  });

  it('emits section labels and omits empty sections', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const texts = plan.labels.map((l) => l.text);
    expect(texts).toContain('Commanders');
    expect(texts).toContain('Main deck');
    expect(texts).toContain('Lands');
    if (!include.includeSet.lieutenants.length) {
      expect(texts).not.toContain('Lieutenants');
    }

    const noLands = {
      ...include.includeSet,
      lands: [],
      cards: include.includeSet.cards.filter((c) => !c.isLand),
      nonLands: include.includeSet.nonLands,
    };
    const planNoLands = buildGlanceLayoutPlan(noLands, deck.name);
    expect(planNoLands.placements.some((p) => p.region === 'land')).toBe(false);
    expect(planNoLands.labels.some((l) => l.text === 'Lands')).toBe(false);
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
