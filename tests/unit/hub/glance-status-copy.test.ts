import { describe, expect, it } from 'vitest';
import {
  formatGlanceStatusLine,
  formatGlanceStatusTooltip,
} from '../../../packages/web/src/lib/glance-ui';

describe('glance status copy', () => {
  it('humanizes the visible line and keeps jargon in the tooltip', () => {
    expect(
      formatGlanceStatusLine({
        generation: '3',
        cache: 'MISS',
        delivery: 'inline',
      }),
    ).toBe('Ready · freshly rendered');
    expect(
      formatGlanceStatusTooltip({
        generation: '3',
        cache: 'MISS',
        delivery: 'inline',
      }),
    ).toBe('gen 3 · cache MISS');
  });

  it('maps cache HIT, PARTIAL, omitted cards, and delivery', () => {
    expect(
      formatGlanceStatusLine({
        cache: 'HIT',
        delivery: 'presigned',
        omittedCardCount: 2,
        pageCount: 2,
      }),
    ).toBe('Ready · 2 images · served from cache · downloaded · 2 cards left off');
    expect(
      formatGlanceStatusLine({
        cache: 'PARTIAL',
        delivery: 'bundle',
      }),
    ).toBe('Ready · partly from cache · bundled images');
  });
});
