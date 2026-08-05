import { describe, expect, it } from 'vitest';
import {
  frontFaceTypeLine,
  glanceCardHeightForWidth,
  glanceCardIdentityBase,
  glanceCardWidthForHeight,
  glanceMaxStackedRows,
  glanceTitlePeek,
  GLANCE_CARD_HEIGHT,
  GLANCE_CARD_WIDTH,
  GLANCE_MIN_VISIBLE_Y,
  isLandType,
  toGlanceCard,
} from '@rayenz-hub/shared';
import { buildEligibleCommanderDeck } from '../../fixtures/deck-builder/glance-eligible.ts';

describe('glance plate helpers', () => {
  it('keeps M card aspect round-trip', () => {
    expect(glanceCardWidthForHeight(GLANCE_CARD_HEIGHT)).toBe(GLANCE_CARD_WIDTH);
    expect(glanceCardHeightForWidth(GLANCE_CARD_WIDTH)).toBe(GLANCE_CARD_HEIGHT);
  });

  it('computes title peek with a readable floor', () => {
    expect(glanceTitlePeek(297)).toBe(Math.max(GLANCE_MIN_VISIBLE_Y, Math.round(297 * 0.14)));
    expect(glanceTitlePeek(10)).toBe(GLANCE_MIN_VISIBLE_Y);
  });

  it('counts stacked rows from peek pitch', () => {
    const h = 100;
    const peek = glanceTitlePeek(h);
    const band = h + peek * 3;
    expect(glanceMaxStackedRows(band, h)).toBe(4);
    expect(glanceMaxStackedRows(h - 1, h)).toBe(0);
  });
});

describe('glance card-from-instance', () => {
  it('uses front-face type line for DFC land detection', () => {
    expect(frontFaceTypeLine('Creature — Human // Land')).toBe('Creature — Human');
    expect(isLandType('Creature — Human // Land', false)).toBe(false);
    expect(isLandType('Land // Creature — Elemental', false)).toBe(true);
    expect(isLandType('Instant', true)).toBe(true);
  });

  it('resolves basic land colours and optional proxy', () => {
    const deck = buildEligibleCommanderDeck();
    const forest = deck.cards.find((c) => c.name === 'Forest')!;
    const face = toGlanceCard(forest, deck);
    expect(face.isLand).toBe(true);
    expect(face.isBasicLand).toBe(true);
    expect(face.colours).toEqual(['G']);
    expect(face.proxy).toBeUndefined();

    const proxied = toGlanceCard({ ...forest, proxy: true }, deck, { includeProxy: true });
    expect(proxied.proxy).toBe(true);
  });

  it('builds a stable fingerprint base identity', () => {
    expect(
      glanceCardIdentityBase({
        instanceId: 'a',
        name: ' Forest ',
        setCode: 'M12',
        collectorNumber: '246',
        quantity: 2,
      }),
    ).toBe('a|forest|m12|246|2');
  });
});
