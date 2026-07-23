import { glanceFingerprint } from './fingerprint.js';
import type {
  GlanceCard,
  GlanceCardPlacement,
  GlanceIncludeSet,
  GlanceLabel,
  GlanceLayoutPlan,
  GlanceRegion,
} from './types.js';
import {
  GLANCE_CANVAS_HEIGHT,
  GLANCE_CANVAS_WIDTH,
  GLANCE_CARD_HEIGHT,
  GLANCE_CARD_WIDTH,
  GLANCE_GENERATION_VERSION,
} from './types.js';

const BACKGROUND = '#1a1a22';
const HEADER_HEIGHT = 56;
const WATERMARK_HEIGHT = 48;
const LABEL_HEIGHT = 28;
const ROLE_GAP = 12;
const BAND_GAP_Y = 8;
const SECTION_GAP = 12;
const COL_GAP = 8;
const CARD_ASPECT = 61 / 85;
const MIN_BAND_CARD_HEIGHT = 48;
/** Minimum vertical peek so card names stay readable. */
const MIN_VISIBLE_Y = 22;
const ORIGIN_X = 24;

function showQuantityFor(card: GlanceCard): boolean {
  return card.isBasicLand && card.quantity > 1;
}

function overlapPitchY(
  count: number,
  bandHeight: number,
  cardHeight: number,
  minVisible: number,
): number {
  if (count <= 1) return cardHeight;
  const needed = bandHeight - cardHeight;
  const pitch = needed / (count - 1);
  return Math.max(minVisible, Math.min(cardHeight, pitch));
}

function distributeColumnMajor(cards: GlanceCard[], cols: number): GlanceCard[][] {
  const columns: GlanceCard[][] = Array.from({ length: cols }, () => []);
  let idx = 0;
  for (let c = 0; c < cols; c++) {
    const remaining = cards.length - idx;
    const remainingCols = cols - c;
    const take = Math.ceil(remaining / remainingCols);
    columns[c] = cards.slice(idx, idx + take);
    idx += take;
  }
  return columns;
}

type BandLayoutResult = {
  placements: GlanceCardPlacement[];
  cardWidth: number;
  cardHeight: number;
};

function solveVerticalBand(
  cards: GlanceCard[],
  region: GlanceRegion,
  originX: number,
  originY: number,
  bandWidth: number,
  bandHeight: number,
  baseZ: number,
): BandLayoutResult {
  if (!cards.length || bandHeight < MIN_BAND_CARD_HEIGHT) {
    return { placements: [], cardWidth: 0, cardHeight: 0 };
  }

  const minCardWidth = Math.round(MIN_BAND_CARD_HEIGHT * CARD_ASPECT);
  const maxCols = Math.max(
    1,
    Math.floor((bandWidth + COL_GAP) / (minCardWidth + COL_GAP)),
  );

  let best: BandLayoutResult | null = null;

  for (let cols = maxCols; cols >= 1; cols--) {
    const columns = distributeColumnMajor(cards, cols);
    const maxRows = Math.max(...columns.map((col) => col.length));
    const cardHeightAtMinPitch =
      maxRows <= 1 ? Math.min(GLANCE_CARD_HEIGHT, bandHeight) : bandHeight - (maxRows - 1) * MIN_VISIBLE_Y;

    if (cardHeightAtMinPitch < MIN_BAND_CARD_HEIGHT) continue;

    const cardHeight = Math.min(GLANCE_CARD_HEIGHT, Math.floor(cardHeightAtMinPitch));
    const cardWidth = Math.round(cardHeight * CARD_ASPECT);
    const colStride = cardWidth + COL_GAP;
    if (cols * colStride - COL_GAP > bandWidth) continue;

    const pitchY = overlapPitchY(maxRows, bandHeight, cardHeight, MIN_VISIBLE_Y);
    const stackHeight = cardHeight + (maxRows - 1) * pitchY;
    if (stackHeight > bandHeight + 1) continue;

    if (best && best.cardHeight >= cardHeight) continue;

    const placements: GlanceCardPlacement[] = [];
    for (let c = 0; c < cols; c++) {
      const col = columns[c]!;
      if (!col.length) continue;
      const x = Math.round(originX + c * colStride);
      col.forEach((card, row) => {
        placements.push({
          card,
          region,
          x,
          y: Math.round(originY + row * pitchY),
          width: cardWidth,
          height: cardHeight,
          zIndex: baseZ + c * 1000 + row,
          showQuantity: showQuantityFor(card),
        });
      });
    }

    best = { placements, cardWidth, cardHeight };
  }

  return best ?? { placements: [], cardWidth: 0, cardHeight: 0 };
}

function placeRoleRow(
  cards: GlanceCard[],
  region: GlanceRegion,
  originX: number,
  originY: number,
  baseZ: number,
): { placements: GlanceCardPlacement[]; nextY: number } {
  if (!cards.length) return { placements: [], nextY: originY };

  const placements: GlanceCardPlacement[] = cards.map((card, index) => ({
    card,
    region,
    x: Math.round(originX + index * (GLANCE_CARD_WIDTH + ROLE_GAP)),
    y: Math.round(originY),
    width: GLANCE_CARD_WIDTH,
    height: GLANCE_CARD_HEIGHT,
    zIndex: baseZ + index,
    showQuantity: showQuantityFor(card),
  }));

  return { placements, nextY: originY + GLANCE_CARD_HEIGHT + BAND_GAP_Y };
}

function pushSectionLabel(
  labels: GlanceLabel[],
  text: string,
  x: number,
  y: number,
): number {
  labels.push({ text, x, y });
  return y + LABEL_HEIGHT;
}

function reserveRoleSection(
  cardCount: number,
): number {
  if (!cardCount) return 0;
  return LABEL_HEIGHT + GLANCE_CARD_HEIGHT + BAND_GAP_Y + SECTION_GAP;
}

function allocateBandHeights(
  remainingHeight: number,
  nonLandCount: number,
  landCount: number,
): { mainBandHeight: number; landBandHeight: number } {
  const mainLabel = nonLandCount ? LABEL_HEIGHT : 0;
  const landLabel = landCount ? LABEL_HEIGHT : 0;
  const gap = nonLandCount && landCount ? SECTION_GAP : 0;
  const bandArea = remainingHeight - mainLabel - landLabel - gap;
  if (bandArea <= 0) return { mainBandHeight: 0, landBandHeight: 0 };

  if (!nonLandCount) return { mainBandHeight: 0, landBandHeight: bandArea };
  if (!landCount) return { mainBandHeight: bandArea, landBandHeight: 0 };

  const landShare = landCount / (nonLandCount + landCount);
  const landBandHeight = Math.max(MIN_BAND_CARD_HEIGHT, Math.floor(bandArea * landShare));
  const mainBandHeight = Math.max(MIN_BAND_CARD_HEIGHT, bandArea - landBandHeight);
  return { mainBandHeight, landBandHeight };
}

export function buildGlanceLayoutPlan(
  includeSet: GlanceIncludeSet,
  deckName: string | null,
): GlanceLayoutPlan {
  const placements: GlanceCardPlacement[] = [];
  const labels: GlanceLabel[] = [];
  const contentWidth = GLANCE_CANVAS_WIDTH - 48;
  const contentBottom = GLANCE_CANVAS_HEIGHT - WATERMARK_HEIGHT;
  let y = HEADER_HEIGHT;

  const reservedForRoles =
    reserveRoleSection(includeSet.commanders.length) +
    reserveRoleSection(includeSet.lieutenants.length);
  const { mainBandHeight, landBandHeight } = allocateBandHeights(
    contentBottom - y - reservedForRoles,
    includeSet.nonLands.length,
    includeSet.lands.length,
  );

  if (includeSet.commanders.length) {
    y = pushSectionLabel(labels, 'Commanders', ORIGIN_X, y);
    const role = placeRoleRow(includeSet.commanders, 'commander', ORIGIN_X, y, 10);
    placements.push(...role.placements);
    y = role.nextY + SECTION_GAP;
  }

  if (includeSet.lieutenants.length) {
    y = pushSectionLabel(labels, 'Lieutenants', ORIGIN_X, y);
    const role = placeRoleRow(includeSet.lieutenants, 'lieutenant', ORIGIN_X, y, 30);
    placements.push(...role.placements);
    y = role.nextY + SECTION_GAP;
  }

  if (includeSet.nonLands.length) {
    y = pushSectionLabel(labels, 'Main deck', ORIGIN_X, y);
    const band = solveVerticalBand(
      includeSet.nonLands,
      'nonland',
      ORIGIN_X,
      y,
      contentWidth,
      mainBandHeight,
      100,
    );
    placements.push(...band.placements);
    y += mainBandHeight + (includeSet.lands.length ? SECTION_GAP : 0);
  }

  if (includeSet.lands.length) {
    y = pushSectionLabel(labels, 'Lands', ORIGIN_X, y);
    const band = solveVerticalBand(
      includeSet.lands,
      'land',
      ORIGIN_X,
      y,
      contentWidth,
      landBandHeight,
      200,
    );
    placements.push(...band.placements);
  }

  const fingerprint = glanceFingerprint(includeSet, GLANCE_GENERATION_VERSION);

  return {
    layoutVersion: GLANCE_GENERATION_VERSION,
    canvasWidth: GLANCE_CANVAS_WIDTH,
    canvasHeight: GLANCE_CANVAS_HEIGHT,
    deckName,
    labels,
    placements,
    fingerprint,
  };
}

export { BACKGROUND, WATERMARK_HEIGHT, MIN_VISIBLE_Y };
