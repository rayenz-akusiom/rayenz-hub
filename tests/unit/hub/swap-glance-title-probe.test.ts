import { describe, expect, it } from 'vitest';
import { buildSwapGlanceLayoutPlans, type SwapGlanceIncludeSet } from '@rayenz-hub/shared';

describe('swap glance section title clipping', () => {
  it('clips long deck-commander headers to column width so titles do not collide', () => {
    const sections = Array.from({ length: 9 }, (_, i) => ({
      deckId: `deck-${i}`,
      deckName: `Long Deck Name ${i}`,
      headerText: `Long Deck Name ${i} — Atraxa, Praetors Voice / Partner Commander`,
      rows: [
        {
          kind: 'pair' as const,
          entryId: `swap-${i}`,
          out: {
            instanceId: `o${i}`,
            name: `Out ${i}`,
            setCode: 'MH3',
            collectorNumber: String(i),
            typeLine: 'Creature',
            colours: [],
            colourIdentity: [],
            primaryCategory: null,
            quantity: 1,
            imageUrl: null,
            isBasicLand: false,
            isLand: false,
            proxy: false,
          },
          in: {
            instanceId: `i${i}`,
            name: `In ${i}`,
            setCode: 'MH3',
            collectorNumber: String(i + 50),
            typeLine: 'Creature',
            colours: [],
            colourIdentity: [],
            primaryCategory: null,
            quantity: 1,
            imageUrl: null,
            isBasicLand: false,
            isLand: false,
          },
        },
      ],
    }));
    const includeSet = {
      mode: 'full',
      includeSeeking: false,
      filterSetCodes: [],
      sections,
    } satisfies SwapGlanceIncludeSet;

    const result = buildSwapGlanceLayoutPlans(includeSet);
    for (const plan of result.plans) {
      const sectionLabels = plan.labels.filter((l) => l.role === 'section');
      expect(sectionLabels.length).toBeGreaterThan(0);
      expect(sectionLabels.every((l) => typeof l.maxWidth === 'number' && l.maxWidth! > 0)).toBe(
        true,
      );

      for (let i = 0; i < sectionLabels.length; i++) {
        const a = sectionLabels[i]!;
        const aW = Math.min(
          Math.ceil(a.text.length * 22 * 0.55),
          a.maxWidth ?? Number.POSITIVE_INFINITY,
        );
        for (let j = i + 1; j < sectionLabels.length; j++) {
          const b = sectionLabels[j]!;
          if (Math.abs(a.y - b.y) > 28) continue;
          const bW = Math.min(
            Math.ceil(b.text.length * 22 * 0.55),
            b.maxWidth ?? Number.POSITIVE_INFINITY,
          );
          const overlaps = a.x < b.x + bW && a.x + aW > b.x;
          expect(overlaps).toBe(false);
        }
      }
    }
  });
});
