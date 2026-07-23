import { describe, expect, it } from 'vitest';
import { buildGlanceIncludeSet, buildGlanceLayoutPlan } from '@rayenz-hub/shared';
import { renderGlancePng } from '../../../packages/api/src/services/glance-render.ts';
import { buildEligibleCommanderDeck } from '../../fixtures/deck-builder/glance-eligible.ts';

describe('deck-builder glance render', () => {
  it('composites strictly from layout coordinates when image loading fails', async () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    const png = await renderGlancePng(plan, {
      imageLoader: async () => null,
    });
    expect(png.byteLength).toBeGreaterThan(1000);
    expect(plan.placements.length).toBeGreaterThan(0);
  });
});
