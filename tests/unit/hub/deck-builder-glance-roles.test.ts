import { describe, expect, it } from 'vitest';
import {
  buildGlanceIncludeSet,
  buildGlanceLayoutPlan,
  listGlanceLieutenants,
} from '@rayenz-hub/shared';
import {
  buildEligibleCommanderDeck,
  buildGlanceSwapCommanderDeck,
  buildMultiLieutenantCommanderDeck,
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

  it('shows quantity badges for any card with quantity > 1', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    for (const placement of plan.placements) {
      expect(placement.showQuantity).toBe(placement.card.quantity > 1);
    }
    expect(plan.placements.some((p) => p.showQuantity)).toBe(true);
  });

  it('lists every lieutenant candidate for the highlight picker', () => {
    const deck = buildMultiLieutenantCommanderDeck(4);
    const lieutenants = listGlanceLieutenants(deck);
    expect(lieutenants.map((c) => c.instanceId)).toEqual([
      'spell-0',
      'spell-1',
      'spell-2',
      'spell-3',
    ]);
  });

  it('highlights the explicitly selected lieutenants and leaves the rest in the main deck', () => {
    const deck = buildMultiLieutenantCommanderDeck(4);
    const include = buildGlanceIncludeSet(deck, {
      lieutenantInstanceIds: ['spell-3', 'spell-1'],
    });
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(include.includeSet.lieutenants.map((c) => c.instanceId)).toEqual([
      'spell-1',
      'spell-3',
    ]);
    const nonLandIds = include.includeSet.nonLands.map((c) => c.instanceId);
    expect(nonLandIds).toContain('spell-0');
    expect(nonLandIds).toContain('spell-2');
    expect(nonLandIds).not.toContain('spell-1');
  });

  it('auto-picks the first two lieutenants when no selection is given', () => {
    const deck = buildMultiLieutenantCommanderDeck(4);
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(include.includeSet.lieutenants.map((c) => c.instanceId)).toEqual([
      'spell-0',
      'spell-1',
    ]);
  });

  it('rejects selections that are not lieutenants or exceed the highlight limit', () => {
    const deck = buildMultiLieutenantCommanderDeck(4);
    const unknown = buildGlanceIncludeSet(deck, { lieutenantInstanceIds: ['spell-40'] });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.code).toBe('GLANCE_INVALID_LIEUTENANTS');

    const tooMany = buildGlanceIncludeSet(deck, {
      lieutenantInstanceIds: ['spell-0', 'spell-1', 'spell-2'],
    });
    expect(tooMany.ok).toBe(false);
    if (tooMany.ok) return;
    expect(tooMany.code).toBe('GLANCE_INVALID_LIEUTENANTS');
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

  it('highlights only the primary printing from a same-name commander gallery', () => {
    const deck = buildEligibleCommanderDeck();
    const second: (typeof deck.cards)[number] = {
      ...deck.cards[0]!,
      instanceId: 'cmd-2',
      setCode: 'sld',
      collectorNumber: '99',
    };
    // Gallery extras do not count toward the 100 — keep the full main deck.
    const withGallery = {
      ...deck,
      cards: [deck.cards[0]!, second, ...deck.cards.slice(1)],
      coverInstanceId: 'cmd-2',
    };
    const include = buildGlanceIncludeSet(withGallery);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(include.includeSet.quantitySum).toBe(100);
    expect(include.includeSet.commanders.map((c) => c.instanceId)).toEqual(['cmd-2']);
    expect(include.includeSet.cards.some((c) => c.instanceId === 'cmd-1')).toBe(false);
    expect(include.includeSet.nonLands.some((c) => c.instanceId === 'cmd-1')).toBe(false);
  });
});
