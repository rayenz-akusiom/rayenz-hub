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

  it('does not blank the second column beside a single commander plate', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(include.includeSet.commanders).toHaveLength(1);
    expect(include.includeSet.lieutenants.length).toBeLessThanOrEqual(1);

    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const cmdPlate = plan.backdrops.find((b) => b.region === 'commander');
    expect(cmdPlate).toBeTruthy();
    if (!cmdPlate) return;

    const colGap = 8;
    const plateRight = cmdPlate.x + cmdPlate.width;
    const roleBottom = Math.max(
      ...plan.backdrops
        .filter((b) => b.region === 'commander' || b.region === 'lieutenant')
        .map((b) => b.y + b.height),
    );

    const besidePlate = plan.placements.filter(
      (p) => (p.region === 'nonland' || p.region === 'land') && p.y < roleBottom,
    );
    expect(besidePlate.length).toBeGreaterThan(0);
    const leftmost = Math.min(...besidePlate.map((p) => p.x));
    // Tall columns start at plate right + COL_GAP (no kiss, no fake empty slot).
    expect(leftmost).toBeGreaterThanOrEqual(plateRight + colGap);
    expect(Math.min(...besidePlate.map((p) => p.y))).toBeLessThan(roleBottom);
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
      sections: include.includeSet.sections.filter((s) => s.name !== 'Lands'),
    };
    const planNoLands = buildGlanceLayoutPlan(noLands, deck.name);
    expect(planNoLands.placements.some((p) => p.region === 'land')).toBe(false);
    expect(planNoLands.labels.some((l) => l.text === 'Lands')).toBe(false);
  });

  it('groups by primary category and labels sections in deck category order', () => {
    const deck = buildEligibleCommanderDeck({
      categories: [
        { name: 'Commander', includedInDeck: true, includedInPrice: true },
        { name: 'Land', includedInDeck: true, includedInPrice: true },
        { name: 'Instant', includedInDeck: true, includedInPrice: true },
        { name: 'Creature', includedInDeck: true, includedInPrice: true },
      ],
    });
    // Move some Instant cards into Creature so both categories appear.
    deck.cards = deck.cards.map((c, i) =>
      c.primaryCategory === 'Instant' && i % 3 === 0
        ? { ...c, primaryCategory: 'Creature', categories: ['Creature'] }
        : c,
    );
    const include = buildGlanceIncludeSet(deck, { mode: 'primary_category' });
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(include.includeSet.mode).toBe('primary_category');
    expect(include.includeSet.sections.map((s) => s.name)).toEqual(['Land', 'Instant', 'Creature']);
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const texts = plan.labels.map((l) => l.text);
    expect(texts).toContain('Commander');
    expect(texts).toContain('Land');
    expect(texts).toContain('Instant');
    expect(texts).toContain('Creature');
    expect(texts).not.toContain('Main deck');
    expect(plan.placements.some((p) => p.region === 'category')).toBe(true);
    expect(plan.placements.every((p) => p.region !== 'nonland' && p.region !== 'land')).toBe(true);
    const maxBottom = Math.max(...plan.placements.map((p) => p.y + p.height));
    expect(maxBottom + WATERMARK_HEIGHT).toBeLessThanOrEqual(plan.canvasHeight);
  });

  it('keeps role plates and fingerprints differently across layout modes', () => {
    const deck = buildEligibleCommanderDeck();
    const typeLine = buildGlanceIncludeSet(deck, { mode: 'type_line' });
    const byCategory = buildGlanceIncludeSet(deck, { mode: 'primary_category' });
    expect(typeLine.ok && byCategory.ok).toBe(true);
    if (!typeLine.ok || !byCategory.ok) return;
    expect(typeLine.includeSet.commanders).toEqual(byCategory.includeSet.commanders);
    const planType = buildGlanceLayoutPlan(typeLine.includeSet, deck.name);
    const planCat = buildGlanceLayoutPlan(byCategory.includeSet, deck.name);
    expect(planType.fingerprint).not.toBe(planCat.fingerprint);
    expect(planType.placements.some((p) => p.region === 'commander')).toBe(true);
    expect(planCat.placements.some((p) => p.region === 'commander')).toBe(true);
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

  it('keeps each section in a contiguous column run (no disconnected orphans)', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck, { mode: 'primary_category' });
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);

    for (const section of include.includeSet.sections) {
      const xs = [
        ...new Set(
          plan.placements
            .filter((p) => section.cards.some((c) => c.instanceId === p.card.instanceId))
            .map((p) => p.x),
        ),
      ].sort((a, b) => a - b);
      if (xs.length < 2) continue;
      // Contiguous run: gaps between sorted column xs are a single stride.
      const strides = new Set<number>();
      for (let i = 1; i < xs.length; i++) strides.add(xs[i]! - xs[i - 1]!);
      expect(strides.size).toBe(1);
    }
  });

  it('stacks primary-category sections vertically when columns have leftover space', () => {
    const catNames = [
      'Ramp',
      'Draw',
      'Removal',
      'Interaction',
      'Aggro',
      'Combo',
      'Value',
      'Synergy',
      'Hate',
      'Tech',
      'Land',
    ];
    const deck = buildEligibleCommanderDeck({
      categories: [
        { name: 'Commander', includedInDeck: true, includedInPrice: true },
        ...catNames.map((name) => ({
          name,
          includedInDeck: true,
          includedInPrice: true,
        })),
      ],
    });
    let ci = 0;
    deck.cards = deck.cards.map((c) => {
      if (c.primaryCategory === 'Commander') return c;
      const cat = catNames[ci++ % catNames.length]!;
      return { ...c, primaryCategory: cat, categories: [cat] };
    });
    const include = buildGlanceIncludeSet(deck, { mode: 'primary_category' });
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const sectionLabels = plan.labels.filter(
      (l) =>
        l.text !== 'Commander' &&
        l.text !== 'Commanders' &&
        l.text !== 'Lieutenant' &&
        l.text !== 'Lieutenants',
    );
    const distinctYs = new Set(sectionLabels.map((l) => l.y));
    // Vertical masonry: more than one horizontal band of section labels.
    expect(distinctYs.size).toBeGreaterThan(1);
  });

  it('prefers keeping cards near M when densify can fit many categories', () => {
    const deck = buildEligibleCommanderDeck({
      categories: [
        { name: 'Commander', includedInDeck: true, includedInPrice: true },
        { name: 'Ramp', includedInDeck: true, includedInPrice: true },
        { name: 'Draw', includedInDeck: true, includedInPrice: true },
        { name: 'Removal', includedInDeck: true, includedInPrice: true },
        { name: 'Land', includedInDeck: true, includedInPrice: true },
        { name: 'Interaction', includedInDeck: true, includedInPrice: true },
      ],
    });
    const cats = ['Ramp', 'Draw', 'Removal', 'Interaction', 'Land'] as const;
    let ci = 0;
    deck.cards = deck.cards.map((c) => {
      if (c.primaryCategory === 'Commander') return c;
      if (c.primaryCategory === 'Land' || c.name === 'Forest') {
        return { ...c, primaryCategory: 'Land', categories: ['Land'] };
      }
      const cat = cats[ci % 4]!;
      ci += 1;
      return { ...c, primaryCategory: cat, categories: [cat] };
    });
    const include = buildGlanceIncludeSet(deck, { mode: 'primary_category' });
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(include.includeSet.sections.length).toBeGreaterThanOrEqual(4);
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    expect(plan.placements.length).toBeGreaterThan(0);
    // Should not collapse to near-minimum solely because section count was high.
    expect(plan.placements[0]!.height).toBeGreaterThan(MIN_VISIBLE_Y * 2);
    expect(plan.placements[0]!.height).toBeGreaterThanOrEqual(Math.round(GLANCE_CARD_HEIGHT * 0.35));
  });

  it('places underfull-deck placeholders in the nonland region', () => {
    const deck = buildEligibleCommanderDeck();
    deck.cards = deck.cards.slice(0, 20);
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(include.includeSet.cards.filter((c) => c.isPlaceholder).length).toBe(80);
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const placeholderPlacements = plan.placements.filter((p) => p.card.isPlaceholder);
    expect(placeholderPlacements).toHaveLength(80);
    expect(placeholderPlacements.every((p) => p.region === 'nonland')).toBe(true);
    expect(plan.placements).toHaveLength(100);
  });
});
