import { describe, expect, it } from 'vitest';
import {
  glanceImageUrlForCard,
  isCdnImageUrl,
} from '../../../packages/api/src/services/glance-art.ts';

describe('glance art resolution', () => {
  it('detects CDN image URLs', () => {
    expect(isCdnImageUrl('https://cards.scryfall.io/normal/front/a/b/id.jpg')).toBe(true);
    expect(isCdnImageUrl('https://api.scryfall.com/cards/named?exact=Forest&format=image')).toBe(false);
  });

  it('prefers CDN URLs when scryfallId is known', () => {
    const url = glanceImageUrlForCard({
      name: 'Forest',
      setCode: 'm12',
      collectorNumber: '246',
      imageUrl: null,
      scryfallId: 'b2c3fa98-f233-4a55-8ea0-5269a6ef9243',
    });
    expect(url).toContain('cards.scryfall.io');
  });
});
