import { describe, expect, it } from 'vitest';
import {
  buildGlanceIncludeSet,
  buildGlanceLayoutPlan,
  buildTitlePips,
  compareGlanceCardsForColourSort,
  GLANCE_CANVAS_HEIGHT,
  GLANCE_CANVAS_WIDTH,
  GLANCE_CARD_HEIGHT,
  GLANCE_CARD_WIDTH,
  GLANCE_GENERATION_VERSION,
  HEADER_HEIGHT,
  MIN_VISIBLE_Y,
  WATERMARK_HEIGHT,
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
    expect(a.backdrops).toEqual(b.backdrops);
    expect(a.titlePips).toEqual(b.titlePips);
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
  });

  it('uses one shared card size across all regions (≤ M)', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    expect(plan.placements.length).toBeGreaterThan(0);
    const w = plan.placements[0]!.width;
    const h = plan.placements[0]!.height;
    expect(w).toBeLessThanOrEqual(GLANCE_CARD_WIDTH);
    expect(h).toBeLessThanOrEqual(GLANCE_CARD_HEIGHT);
    for (const placement of plan.placements) {
      expect(placement.width).toBe(w);
      expect(placement.height).toBe(h);
    }
  });

  it('places commanders side-by-side with a backdrop plate', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const cmds = plan.placements.filter((p) => p.region === 'commander');
    expect(cmds.length).toBeGreaterThanOrEqual(1);
    expect(cmds.every((p) => p.y === cmds[0]!.y)).toBe(true);
    if (cmds.length === 2) {
      expect(cmds[1]!.x).toBeGreaterThan(cmds[0]!.x);
    }
    expect(plan.backdrops.some((b) => b.region === 'commander')).toBe(true);
    expect(plan.labels.some((l) => l.text === 'Commander' || l.text === 'Commanders')).toBe(true);
  });

  it('uses singular Commander label for one commander', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(include.includeSet.commanders).toHaveLength(1);
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    expect(plan.labels.map((l) => l.text)).toContain('Commander');
    expect(plan.labels.map((l) => l.text)).not.toContain('Commanders');
  });

  it('emits WUBRG-ordered title pips from commander colour identity', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    expect(plan.titlePips).toEqual(buildTitlePips(include.includeSet.commanders));
    expect(plan.titlePips.length).toBeGreaterThan(0);
  });

  it('keeps lands in the land region only', () => {
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

  it('fans non-role cards vertically at a constant, fixed title-peek pitch', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const stackable = plan.placements.filter(
      (p) => p.region === 'nonland' || p.region === 'land',
    );
    const byX = new Map<number, typeof stackable>();
    for (const p of stackable) {
      const list = byX.get(p.x) || [];
      list.push(p);
      byX.set(p.x, list);
    }
    let foundStackedColumn = false;
    const pitches = new Set<number>();
    for (const col of byX.values()) {
      if (col.length < 2) continue;
      foundStackedColumn = true;
      const sorted = [...col].sort((a, b) => a.y - b.y);
      const colPitches = new Set<number>();
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.x).toBe(sorted[0]!.x);
        const pitch = sorted[i]!.y - sorted[i - 1]!.y;
        expect(pitch).toBeGreaterThanOrEqual(MIN_VISIBLE_Y);
        expect(pitch).toBeLessThanOrEqual(sorted[0]!.height);
        expect(sorted[i]!.zIndex).toBeGreaterThan(sorted[i - 1]!.zIndex);
        colPitches.add(pitch);
        pitches.add(pitch);
      }
      // Fixed peek: every gap within a column is identical (no stretch-to-fill).
      expect(colPitches.size).toBe(1);
    }
    expect(foundStackedColumn).toBe(true);
    // The same peek is shared across all stacked columns for one render.
    expect(pitches.size).toBe(1);
  });

  it('emits section labels and omits empty sections', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const texts = plan.labels.map((l) => l.text);
    expect(texts).toContain('Commander');
    expect(texts).toContain('Main deck');
    expect(texts).toContain('Lands');
    if (!include.includeSet.lieutenants.length) {
      expect(texts).not.toContain('Lieutenant');
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
    expect(maxBottom + WATERMARK_HEIGHT).toBeLessThanOrEqual(plan.canvasHeight);
    expect(Math.min(...plan.placements.map((p) => p.y))).toBeGreaterThanOrEqual(HEADER_HEIGHT);
  });

  it('can wrap main-deck columns under the role block', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const cmds = plan.placements.filter((p) => p.region === 'commander');
    const nonlands = plan.placements.filter((p) => p.region === 'nonland');
    expect(cmds.length).toBeGreaterThan(0);
    expect(nonlands.length).toBeGreaterThan(0);
    const roleBottom = Math.max(...cmds.map((p) => p.y + p.height));
    const roleRight = Math.max(...cmds.map((p) => p.x + p.width));
    // Main deck (not lands) fills the void directly under the role block.
    const underRole = nonlands.some((p) => p.x < roleRight - 1 && p.y >= roleBottom - 1);
    expect(underRole).toBe(true);
    const lands = plan.placements.filter((p) => p.region === 'land');
    const landsUnderRole = lands.some((p) => p.x < roleRight - 1 && p.y >= roleBottom - 1);
    expect(landsUnderRole).toBe(false);
  });
});
