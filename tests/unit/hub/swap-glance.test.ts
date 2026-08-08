import { describe, expect, it } from 'vitest';
import {
  aggregateSwapWants,
  buildSwapGlanceIncludeSet,
  buildSwapGlanceLayoutPlan,
  buildSwapGlanceLayoutPlans,
  countSwapGlanceItems,
  PAIR_INNER_GAP,
  selectSwapGlanceItems,
  GLANCE_CANVAS_HEIGHT,
  GLANCE_CANVAS_WIDTH,
  GLANCE_CARD_WIDTH,
  SWAP_GLANCE_GENERATION_VERSION,
  swapGlanceFingerprint,
  swapGlanceHeaderText,
  type DeckDocument,
  type SwapGlanceCard,
  type SwapGlanceIncludeSet,
} from '@rayenz-hub/shared';
import {
  buildEligibleCommanderDeck,
  buildGlanceSwapCommanderDeck,
} from '../../fixtures/deck-builder/glance-eligible.ts';

function glanceFace(partial: Partial<SwapGlanceCard> & Pick<SwapGlanceCard, 'instanceId' | 'name'>): SwapGlanceCard {
  return {
    setCode: 'MH3',
    collectorNumber: '1',
    typeLine: 'Creature',
    colours: [],
    colourIdentity: [],
    primaryCategory: null,
    quantity: 1,
    imageUrl: null,
    isBasicLand: false,
    isLand: false,
    ...partial,
  };
}

function singleSection(
  deckId: string,
  deckName: string,
  headerText: string,
  cards: Array<{ entryId: string; sourceKind: 'seeking' | 'queued_in'; card: SwapGlanceCard }>,
): SwapGlanceIncludeSet['sections'][number] {
  return {
    deckId,
    deckName,
    headerText,
    rows: cards.map((c) => ({
      kind: 'single' as const,
      entryId: c.entryId,
      sourceKind: c.sourceKind,
      card: c.card,
    })),
  };
}

function pairSection(
  deckId: string,
  deckName: string,
  headerText: string,
  pairs: Array<{ entryId: string; out: SwapGlanceCard | null; in: SwapGlanceCard | null }>,
): SwapGlanceIncludeSet['sections'][number] {
  return {
    deckId,
    deckName,
    headerText,
    rows: pairs.map((p) => ({
      kind: 'pair' as const,
      entryId: p.entryId,
      out: p.out,
      in: p.in,
    })),
  };
}

function includeFromSections(
  sections: SwapGlanceIncludeSet['sections'],
  opts: Partial<Pick<SwapGlanceIncludeSet, 'mode' | 'includeSeeking' | 'filterSetCodes'>> = {},
): SwapGlanceIncludeSet {
  return {
    mode: opts.mode ?? 'in_only',
    includeSeeking: opts.includeSeeking ?? true,
    filterSetCodes: opts.filterSetCodes ?? [],
    sections,
  };
}

function withSeeking(deck: DeckDocument, instanceId: string, entryId = 'seek-1'): DeckDocument {
  return {
    ...deck,
    lookingForEntries: [
      ...(deck.lookingForEntries || []),
      { id: entryId, instanceId, sortIndex: 0, notes: null },
    ],
  };
}

function withProxyOut(deck: DeckDocument): DeckDocument {
  return {
    ...deck,
    cards: (deck.cards || []).map((c) =>
      c.instanceId === 'spell-0' ? { ...c, proxy: true } : c,
    ),
  };
}

describe('swap glance select', () => {
  it('in_only includes Queued In and optional Seeking', () => {
    const deck = withSeeking(buildGlanceSwapCommanderDeck(), 'spell-1');
    const sources = aggregateSwapWants([deck]);

    const withoutSeeking = selectSwapGlanceItems(sources, {
      mode: 'in_only',
      includeSeeking: false,
    });
    expect(withoutSeeking.every((i) => i.kind === 'queued_in')).toBe(true);
    expect(withoutSeeking.length).toBe(1);

    const withSeek = selectSwapGlanceItems(sources, {
      mode: 'in_only',
      includeSeeking: true,
    });
    expect(withSeek.some((i) => i.kind === 'seeking')).toBe(true);
    expect(countSwapGlanceItems(sources, { mode: 'in_only', includeSeeking: true })).toBe(
      withSeek.length,
    );
  });

  it('full mode collapses In/Out to one item per formal pair', () => {
    const deck = buildGlanceSwapCommanderDeck();
    const sources = aggregateSwapWants([deck]);
    const items = selectSwapGlanceItems(sources, { mode: 'full', includeSeeking: false });
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('queued_in');
    expect(items[0]!.entryId).toBe('swap-1');
  });
});

describe('swap glance header text', () => {
  it('includes single commander name', () => {
    const deck = buildEligibleCommanderDeck({ name: 'Superfriends' });
    expect(swapGlanceHeaderText(deck)).toBe('Superfriends — Atraxa, Praetors Voice');
  });

  it('omits commander suffix when none present', () => {
    const deck = buildEligibleCommanderDeck({
      name: 'My Cube',
      format: 'cube',
      cards: (buildEligibleCommanderDeck().cards || []).filter(
        (c) => c.primaryCategory !== 'Commander',
      ),
    });
    expect(swapGlanceHeaderText(deck)).toBe('My Cube');
  });

  it('lists a gallery commander once', () => {
    const base = buildEligibleCommanderDeck({ name: 'Hero' });
    const second = {
      ...base.cards[0]!,
      instanceId: 'cmd-2',
      setCode: 'sld',
      collectorNumber: '99',
    };
    const deck = {
      ...base,
      cards: [base.cards[0]!, second, ...base.cards.slice(1)],
    };
    expect(swapGlanceHeaderText(deck)).toBe('Hero — Atraxa, Praetors Voice');
  });
});

describe('swap glance include-set + layout', () => {
  it('builds pair rows for full mode and singles for in_only', () => {
    const deck = withSeeking(buildGlanceSwapCommanderDeck(), 'spell-2');
    const sources = aggregateSwapWants([deck]);

    const fullItems = selectSwapGlanceItems(sources, { mode: 'full', includeSeeking: true });
    const full = buildSwapGlanceIncludeSet([deck], fullItems, {
      mode: 'full',
      includeSeeking: true,
    });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(full.includeSet.sections).toHaveLength(1);
    expect(full.includeSet.sections[0]!.headerText).toContain('Atraxa');
    expect(full.includeSet.sections[0]!.rows.some((r) => r.kind === 'pair')).toBe(true);
    expect(full.includeSet.sections[0]!.rows.some((r) => r.kind === 'single')).toBe(true);

    const inItems = selectSwapGlanceItems(sources, { mode: 'in_only', includeSeeking: false });
    const inOnly = buildSwapGlanceIncludeSet([deck], inItems, {
      mode: 'in_only',
      includeSeeking: false,
    });
    expect(inOnly.ok).toBe(true);
    if (!inOnly.ok) return;
    expect(inOnly.includeSet.sections[0]!.rows.every((r) => r.kind === 'single')).toBe(true);
  });

  it('layout is 1920×1080, deterministic, and fingerprints by generation', () => {
    const deck = buildGlanceSwapCommanderDeck();
    const items = selectSwapGlanceItems(aggregateSwapWants([deck]), {
      mode: 'full',
      includeSeeking: false,
    });
    const include = buildSwapGlanceIncludeSet([deck], items, {
      mode: 'full',
      includeSeeking: false,
    });
    expect(include.ok).toBe(true);
    if (!include.ok) return;

    const a = buildSwapGlanceLayoutPlan(include.includeSet);
    const b = buildSwapGlanceLayoutPlan(include.includeSet);
    expect(a.canvasWidth).toBe(GLANCE_CANVAS_WIDTH);
    expect(a.canvasHeight).toBe(GLANCE_CANVAS_HEIGHT);
    expect(a.layoutVersion).toBe(SWAP_GLANCE_GENERATION_VERSION);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.placements).toEqual(b.placements);
    expect(a.labels.some((l) => l.role === 'title')).toBe(true);
    expect(a.labels.some((l) => l.role === 'section')).toBe(true);
    expect(a.placements.length).toBeGreaterThanOrEqual(2);
  });

  it('full mode packs Out→In with a connector slot and pair gap', () => {
    const deck = buildGlanceSwapCommanderDeck();
    const items = selectSwapGlanceItems(aggregateSwapWants([deck]), {
      mode: 'full',
      includeSeeking: false,
    });
    const include = buildSwapGlanceIncludeSet([deck], items, {
      mode: 'full',
      includeSeeking: false,
    });
    expect(include.ok).toBe(true);
    if (!include.ok) return;

    const plan = buildSwapGlanceLayoutPlan(include.includeSet);
    expect(plan.connectors.length).toBeGreaterThanOrEqual(1);
    expect(plan.connectors[0]!.width).toBe(PAIR_INNER_GAP);

    const out = plan.placements.find((p) => p.pairRole === 'out');
    const inn = plan.placements.find((p) => p.pairRole === 'in');
    expect(out).toBeTruthy();
    expect(inn).toBeTruthy();
    expect(inn!.x - (out!.x + out!.width)).toBe(PAIR_INNER_GAP);
  });

  it('shows proxy badge on Out faces only when card.proxy', () => {
    const deck = withProxyOut(buildGlanceSwapCommanderDeck());
    const items = selectSwapGlanceItems(aggregateSwapWants([deck]), {
      mode: 'full',
      includeSeeking: false,
    });
    const include = buildSwapGlanceIncludeSet([deck], items, {
      mode: 'full',
      includeSeeking: false,
    });
    expect(include.ok).toBe(true);
    if (!include.ok) return;

    const pair = include.includeSet.sections[0]!.rows.find((r) => r.kind === 'pair');
    expect(pair?.kind === 'pair' && pair.out?.proxy).toBe(true);
    expect(pair?.kind === 'pair' && pair.in?.proxy).toBe(false);

    const plan = buildSwapGlanceLayoutPlan(include.includeSet);
    const out = plan.placements.find((p) => p.pairRole === 'out');
    const inn = plan.placements.find((p) => p.pairRole === 'in');
    expect(out?.showProxy).toBe(true);
    expect(inn?.showProxy).toBe(false);
  });

  it('fingerprint changes when filterSetCodes or Out proxy flips', () => {
    const deck = buildGlanceSwapCommanderDeck();
    const items = selectSwapGlanceItems(aggregateSwapWants([deck]), {
      mode: 'full',
      includeSeeking: false,
    });
    const base = buildSwapGlanceIncludeSet([deck], items, {
      mode: 'full',
      includeSeeking: false,
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    const withSets = buildSwapGlanceIncludeSet([deck], items, {
      mode: 'full',
      includeSeeking: false,
      filterSetCodes: ['mh3', 'msc'],
    });
    expect(withSets.ok).toBe(true);
    if (!withSets.ok) return;
    expect(withSets.includeSet.filterSetCodes).toEqual(['MH3', 'MSC']);
    expect(swapGlanceFingerprint(withSets.includeSet)).not.toBe(
      swapGlanceFingerprint(base.includeSet),
    );

    const plan = buildSwapGlanceLayoutPlan(withSets.includeSet);
    expect(plan.filterSetCodes).toEqual(['MH3', 'MSC']);

    const proxied = withProxyOut(deck);
    const withProxy = buildSwapGlanceIncludeSet([proxied], items, {
      mode: 'full',
      includeSeeking: false,
    });
    expect(withProxy.ok).toBe(true);
    if (!withProxy.ok) return;
    expect(swapGlanceFingerprint(withProxy.includeSet)).not.toBe(
      swapGlanceFingerprint(base.includeSet),
    );
  });

  it('masonry packs many single-row decks without omitting', () => {
    const sectionCount = 16;
    const includeSet = includeFromSections(
      Array.from({ length: sectionCount }, (_, i) =>
        singleSection(`deck-${i}`, `Deck ${i}`, `Deck ${i}`, [
          {
            entryId: `in-${i}`,
            sourceKind: 'queued_in',
            card: glanceFace({
              instanceId: `card-${i}`,
              name: `Card ${i}`,
              collectorNumber: String(i + 1),
            }),
          },
        ]),
      ),
      { includeSeeking: false },
    );

    const result = buildSwapGlanceLayoutPlans(includeSet);
    const placed = result.plans.reduce((n, p) => n + p.placements.length, 0);
    expect(placed).toBe(sectionCount);
    expect(result.omittedCardCount).toBe(0);
    expect(result.plans.every((p) => p.placements.every((c) => c.width === GLANCE_CARD_WIDTH))).toBe(
      true,
    );
    expect(result.plans.some((p) => p.labels.some((l) => l.role === 'more' && /more decks/.test(l.text)))).toBe(
      false,
    );
  });

  it('masonry fits 10 decks with 16 looking-for cards at fixed M size', () => {
    const cardCounts = [2, 2, 2, 2, 2, 2, 1, 1, 1, 1]; // 16 cards, 10 decks
    const includeSet = includeFromSections(
      cardCounts.map((count, i) =>
        singleSection(
          `deck-${i}`,
          `Deck ${i}`,
          `Deck ${i}`,
          Array.from({ length: count }, (_, j) => ({
            entryId: `in-${i}-${j}`,
            sourceKind: 'queued_in' as const,
            card: glanceFace({
              instanceId: `card-${i}-${j}`,
              name: `Card ${i}-${j}`,
              collectorNumber: `${i}${j}`,
            }),
          })),
        ),
      ),
      { includeSeeking: false },
    );

    const result = buildSwapGlanceLayoutPlans(includeSet);
    const placed = result.plans.reduce((n, p) => n + p.placements.length, 0);
    expect(placed).toBe(16);
    expect(result.omittedCardCount).toBe(0);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.pageCount).toBeLessThanOrEqual(5);
    for (const plan of result.plans) {
      expect(plan.placements.every((p) => p.width === GLANCE_CARD_WIDTH)).toBe(true);
      expect(plan.placements.every((p) => p.height === Math.round(GLANCE_CARD_WIDTH / (61 / 85)))).toBe(
        true,
      );
    }
  });

  it('groups seeking onto later pages after formal content', () => {
    const formalSections = Array.from({ length: 12 }, (_, i) =>
      singleSection(`formal-${i}`, `Formal ${i}`, `Formal ${i}`, [
        {
          entryId: `in-${i}`,
          sourceKind: 'queued_in',
          card: glanceFace({
            instanceId: `f-${i}`,
            name: `Formal Card ${i}`,
            collectorNumber: String(i),
          }),
        },
      ]),
    );
    const seekingSections = Array.from({ length: 12 }, (_, i) =>
      singleSection(`seek-${i}`, `Seek ${i}`, `Seek ${i}`, [
        {
          entryId: `seek-${i}`,
          sourceKind: 'seeking',
          card: glanceFace({
            instanceId: `s-${i}`,
            name: `Seek Card ${i}`,
            collectorNumber: String(i + 100),
          }),
        },
      ]),
    );
    // Merge by deck so include set has both kinds — alternate by concatenating sections
    const includeSet = includeFromSections([...formalSections, ...seekingSections], {
      includeSeeking: true,
    });

    const result = buildSwapGlanceLayoutPlans(includeSet);
    expect(result.pageCount).toBeGreaterThan(1);
    expect(result.omittedCardCount).toBe(0);

    // Find first page that has a seeking card and last page that has a formal card
    const pageHasSeeking = result.plans.map((p) =>
      p.labels.some((l) => l.role === 'section' && l.text.startsWith('Seek ')),
    );
    const pageHasFormal = result.plans.map((p) =>
      p.labels.some((l) => l.role === 'section' && l.text.startsWith('Formal ')),
    );
    const lastFormal = pageHasFormal.lastIndexOf(true);
    const firstSeeking = pageHasSeeking.indexOf(true);
    expect(lastFormal).toBeGreaterThanOrEqual(0);
    expect(firstSeeking).toBeGreaterThanOrEqual(0);
    expect(firstSeeking).toBeGreaterThanOrEqual(lastFormal);
  });

  it('converts full pairs to looking-for when densifying', () => {
    // Many full pairs that cannot fit as Out→In at M across 5 pages without densify
    const sections = Array.from({ length: 40 }, (_, i) =>
      pairSection(`deck-${i}`, `Deck ${i}`, `Deck ${i}`, [
        {
          entryId: `swap-${i}`,
          out: glanceFace({
            instanceId: `out-${i}`,
            name: `Out ${i}`,
            collectorNumber: String(i),
            proxy: false,
          }),
          in: glanceFace({
            instanceId: `in-${i}`,
            name: `In ${i}`,
            collectorNumber: String(i + 50),
          }),
        },
      ]),
    );
    const includeSet = includeFromSections(sections, { mode: 'full', includeSeeking: false });

    const result = buildSwapGlanceLayoutPlans(includeSet);
    expect(result.pageCount).toBeLessThanOrEqual(5);
    // After densify to looking-for, no connectors / out faces (or truncate with +X)
    const allConnectors = result.plans.reduce((n, p) => n + p.connectors.length, 0);
    const outFaces = result.plans.reduce(
      (n, p) => n + p.placements.filter((c) => c.pairRole === 'out').length,
      0,
    );
    if (
      result.densifyStage === 'swaps_to_looking_for_grid' ||
      result.densifyStage === 'swaps_to_looking_for_stacked' ||
      result.densifyStage === 'truncate'
    ) {
      expect(allConnectors).toBe(0);
      expect(outFaces).toBe(0);
    }
    expect(result.plans.every((p) => p.placements.every((c) => c.width === GLANCE_CARD_WIDTH))).toBe(
      true,
    );
    // Pair columns must be wide enough — no colliding faces across masonry columns.
    for (const plan of result.plans) {
      for (let i = 0; i < plan.placements.length; i++) {
        const a = plan.placements[i]!;
        for (let j = i + 1; j < plan.placements.length; j++) {
          const b = plan.placements[j]!;
          const intersect =
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y;
          if (!intersect) continue;
          const stackedPeek = a.x === b.x && Math.abs(a.y - b.y) < a.height;
          expect(stackedPeek).toBe(true);
        }
      }
    }
  });

  it('titles multi-page plates with page index', () => {
    const sections = Array.from({ length: 30 }, (_, i) =>
      singleSection(
        `deck-${i}`,
        `Deck ${i}`,
        `Deck ${i}`,
        Array.from({ length: 3 }, (_, j) => ({
          entryId: `in-${i}-${j}`,
          sourceKind: 'queued_in' as const,
          card: glanceFace({
            instanceId: `card-${i}-${j}`,
            name: `Card ${i}-${j}`,
            collectorNumber: `${i}${j}`,
          }),
        })),
      ),
    );
    const includeSet = includeFromSections(sections, { includeSeeking: false });
    const result = buildSwapGlanceLayoutPlans(includeSet);
    expect(result.pageCount).toBeGreaterThan(1);
    for (let i = 0; i < result.plans.length; i++) {
      const title = result.plans[i]!.labels.find((l) => l.role === 'title');
      expect(title?.text).toBe(`Swaps at a glance (${i + 1}/${result.pageCount})`);
    }
  });

  it('returns SWAP_GLANCE_EMPTY when items resolve to nothing', () => {
    const deck = buildEligibleCommanderDeck();
    const result = buildSwapGlanceIncludeSet(
      [deck],
      [{ deckId: deck.deckId, kind: 'queued_in', entryId: 'missing' }],
      { mode: 'in_only', includeSeeking: false },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SWAP_GLANCE_EMPTY');
  });
});
