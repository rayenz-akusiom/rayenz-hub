import { describe, expect, it } from 'vitest';
import {
  buildGlanceIncludeSet,
  buildGlanceLayoutPlan,
  resolveGlanceChromeTheme,
} from '@rayenz-hub/shared';
import { renderGlancePng } from '../../../packages/api/src/services/glance-render.ts';
import { buildEligibleCommanderDeck } from '../../fixtures/deck-builder/glance-eligible.ts';

describe('deck-builder glance render', () => {
  it(
    'composites strictly from layout coordinates when image loading fails',
    async () => {
      const deck = buildEligibleCommanderDeck();
      const include = buildGlanceIncludeSet(deck);
      expect(include.ok).toBe(true);
      if (!include.ok) return;
      const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
      const png = await renderGlancePng(plan, {
        imageLoader: async () => null,
        fastPng: true,
      });
      expect(png.byteLength).toBeGreaterThan(1000);
      expect(plan.placements.length).toBeGreaterThan(0);
      expect(plan.labels.length).toBeGreaterThan(0);
      // Fixture commander is 4-colour → gold chrome theme resolves.
      const theme = resolveGlanceChromeTheme(plan.titlePips);
      expect(theme.headerFill).toEqual({ kind: 'solid', hex: '#B8860B' });
    },
    30_000,
  );

  it(
    'composites a dual-colour soft-blend plate',
    async () => {
      const deck = buildEligibleCommanderDeck();
      const include = buildGlanceIncludeSet(deck);
      expect(include.ok).toBe(true);
      if (!include.ok) return;
      const plan = {
        ...buildGlanceLayoutPlan(include.includeSet, deck.name),
        titlePips: ['R', 'G'],
      };
      const theme = resolveGlanceChromeTheme(plan.titlePips);
      expect(theme.background.kind).toBe('softBlend');
      const png = await renderGlancePng(plan, {
        imageLoader: async () => null,
        fastPng: true,
      });
      expect(png.byteLength).toBeGreaterThan(1000);
    },
    30_000,
  );
});
