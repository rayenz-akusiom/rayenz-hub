import { describe, expect, it } from 'vitest';
import {
  aggregateSwapWants,
  buildSwapGlanceIncludeSet,
  buildSwapGlanceLayoutPlan,
  countSwapGlanceItems,
  PAIR_INNER_GAP,
  selectSwapGlanceItems,
  SWAP_GLANCE_CANVAS_HEIGHT,
  SWAP_GLANCE_CANVAS_WIDTH,
  SWAP_GLANCE_GENERATION_VERSION,
  swapGlanceFingerprint,
  swapGlanceHeaderText,
  type DeckDocument,
} from '@rayenz-hub/shared';
import {
  buildEligibleCommanderDeck,
  buildGlanceSwapCommanderDeck,
} from '../../fixtures/deck-builder/glance-eligible.ts';

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
    expect(a.canvasWidth).toBe(SWAP_GLANCE_CANVAS_WIDTH);
    expect(a.canvasHeight).toBe(SWAP_GLANCE_CANVAS_HEIGHT);
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
