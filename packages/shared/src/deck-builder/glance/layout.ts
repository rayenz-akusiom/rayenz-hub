import { glanceFingerprint } from './fingerprint.js';
import type { GlanceCard, GlanceCardPlacement, GlanceIncludeSet, GlanceLayoutPlan } from './types.js';
import {
  GLANCE_CANVAS_HEIGHT,
  GLANCE_CANVAS_WIDTH,
  GLANCE_LAYOUT_VERSION,
} from './types.js';

const BACKGROUND = '#1a1a22';
const HEADER_HEIGHT = 56;
const WATERMARK_HEIGHT = 48;
const ROLE_CARD_WIDTH = 130;
const ROLE_CARD_HEIGHT = 182;
const BAND_CARD_WIDTH = 76;
const BAND_CARD_HEIGHT = 106;
const ROLE_GAP = 10;
const BAND_GAP_Y = 6;
const LAND_BAND_GAP = 12;
const MIN_VISIBLE = 22;

function showQuantityFor(card: GlanceCard): boolean {
  return card.isBasicLand && card.quantity > 1;
}

function overlapPitch(count: number, bandWidth: number, cardWidth: number, minVisible: number): number {
  if (count <= 1) return cardWidth;
  const maxPitch = cardWidth;
  const minPitch = minVisible;
  const needed = bandWidth - cardWidth;
  const pitch = needed / (count - 1);
  return Math.max(minPitch, Math.min(maxPitch, pitch));
}

function placeBand(
  cards: GlanceCard[],
  region: GlanceCardPlacement['region'],
  originX: number,
  originY: number,
  bandWidth: number,
  cardWidth: number,
  cardHeight: number,
  baseZ: number,
): { placements: GlanceCardPlacement[]; nextY: number } {
  if (!cards.length) return { placements: [], nextY: originY };

  const pitchX = overlapPitch(cards.length, bandWidth, cardWidth, MIN_VISIBLE);
  const placements: GlanceCardPlacement[] = cards.map((card, index) => ({
    card,
    region,
    x: Math.round(originX + index * pitchX),
    y: Math.round(originY),
    width: cardWidth,
    height: cardHeight,
    zIndex: baseZ + index,
    showQuantity: showQuantityFor(card),
  }));

  return { placements, nextY: originY + cardHeight + BAND_GAP_Y };
}

export function buildGlanceLayoutPlan(
  includeSet: GlanceIncludeSet,
  deckName: string | null,
): GlanceLayoutPlan {
  const placements: GlanceCardPlacement[] = [];
  const contentWidth = GLANCE_CANVAS_WIDTH - 48;
  const originX = 24;
  let y = HEADER_HEIGHT;

  const roleCards = [...includeSet.commanders, ...includeSet.lieutenants];
  if (roleCards.length) {
    roleCards.forEach((card, index) => {
      const region = includeSet.commanders.some((c) => c.instanceId === card.instanceId)
        ? 'commander'
        : 'lieutenant';
      placements.push({
        card,
        region,
        x: originX + index * (ROLE_CARD_WIDTH + ROLE_GAP),
        y,
        width: ROLE_CARD_WIDTH,
        height: ROLE_CARD_HEIGHT,
        zIndex: 10 + index,
        showQuantity: showQuantityFor(card),
      });
    });
    y += ROLE_CARD_HEIGHT + BAND_GAP_Y;
  }

  const nonLandBand = placeBand(
    includeSet.nonLands,
    'nonland',
    originX,
    y,
    contentWidth,
    BAND_CARD_WIDTH,
    BAND_CARD_HEIGHT,
    100,
  );
  placements.push(...nonLandBand.placements);
  y = nonLandBand.nextY;

  if (includeSet.lands.length) {
    y += LAND_BAND_GAP;
    const landBand = placeBand(
      includeSet.lands,
      'land',
      originX,
      y,
      contentWidth,
      BAND_CARD_WIDTH,
      BAND_CARD_HEIGHT,
      200,
    );
    placements.push(...landBand.placements);
    y = landBand.nextY;
  }

  const fingerprint = glanceFingerprint(includeSet, GLANCE_LAYOUT_VERSION);

  return {
    layoutVersion: GLANCE_LAYOUT_VERSION,
    canvasWidth: GLANCE_CANVAS_WIDTH,
    canvasHeight: GLANCE_CANVAS_HEIGHT,
    deckName,
    placements,
    fingerprint,
  };
}

export { BACKGROUND, WATERMARK_HEIGHT };
