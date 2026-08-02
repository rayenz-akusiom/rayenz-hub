import { swapGlanceFingerprint } from './fingerprint.js';
import type {
  SwapGlanceCard,
  SwapGlanceIncludeSet,
  SwapGlanceLabel,
  SwapGlanceLayoutPlan,
  SwapGlancePlacement,
  SwapGlanceRow,
} from './types.js';
import {
  SWAP_GLANCE_CANVAS_HEIGHT,
  SWAP_GLANCE_CANVAS_WIDTH,
  SWAP_GLANCE_CARD_HEIGHT,
  SWAP_GLANCE_CARD_WIDTH,
  SWAP_GLANCE_GENERATION_VERSION,
} from './types.js';

/** Same plate colour as deck glance. */
export const SWAP_GLANCE_BACKGROUND = '#b8d4e8';
export const SWAP_GLANCE_TITLE_HEIGHT = 72;
export const SWAP_GLANCE_WATERMARK_HEIGHT = 48;
const CONTENT_MARGIN_X = 24;
const CONTENT_MARGIN_Y = 16;
const SECTION_GAP = 14;
const SECTION_HEADER_HEIGHT = 32;
const CARD_GAP = 8;
const PAIR_INNER_GAP = 6;
const PAIR_GROUP_GAP = 16;
const CARD_ASPECT = 61 / 85;
const MIN_CARD_WIDTH = 56;

type FaceSlot = {
  card: SwapGlanceCard;
  pairRole: 'out' | 'in' | 'single';
  showQuantity: boolean;
};

function facesFromRow(row: SwapGlanceRow): FaceSlot[] {
  if (row.kind === 'single') {
    return [
      {
        card: row.card,
        pairRole: 'single',
        showQuantity: row.card.quantity > 1,
      },
    ];
  }
  const faces: FaceSlot[] = [];
  if (row.out) {
    faces.push({
      card: row.out,
      pairRole: 'out',
      showQuantity: row.out.quantity > 1,
    });
  }
  if (row.in) {
    faces.push({
      card: row.in,
      pairRole: 'in',
      showQuantity: row.in.quantity > 1,
    });
  }
  return faces;
}

/** Width of one logical unit (single face or Out+In pair) at a given card width. */
function unitWidth(row: SwapGlanceRow, cardW: number): number {
  if (row.kind === 'single') return cardW;
  const faces = (row.out ? 1 : 0) + (row.in ? 1 : 0);
  if (faces <= 1) return cardW;
  return cardW * 2 + PAIR_INNER_GAP;
}

function cardHeightForWidth(cardW: number): number {
  return Math.round(cardW / CARD_ASPECT);
}

type PackedUnit = {
  row: SwapGlanceRow;
  x: number;
  y: number;
};

/**
 * Pack rows into a band; returns placed units and how many rows were omitted.
 */
function packRows(
  rows: SwapGlanceRow[],
  originX: number,
  originY: number,
  bandWidth: number,
  bandHeight: number,
  cardW: number,
): { units: PackedUnit[]; omitted: number } {
  const cardH = cardHeightForWidth(cardW);
  const units: PackedUnit[] = [];
  let x = originX;
  let y = originY;
  let rowMaxH = cardH;
  let placed = 0;

  for (const row of rows) {
    const w = unitWidth(row, cardW);
    const gap = row.kind === 'pair' ? PAIR_GROUP_GAP : CARD_GAP;
    if (x > originX && x + w > originX + bandWidth) {
      x = originX;
      y += rowMaxH + CARD_GAP;
      rowMaxH = cardH;
    }
    if (y + cardH > originY + bandHeight) {
      return { units, omitted: rows.length - placed };
    }
    units.push({ row, x, y });
    placed += 1;
    x += w + gap;
  }
  return { units, omitted: 0 };
}

function placementsFromUnits(
  units: PackedUnit[],
  cardW: number,
): SwapGlancePlacement[] {
  const cardH = cardHeightForWidth(cardW);
  const placements: SwapGlancePlacement[] = [];
  for (const unit of units) {
    const faces = facesFromRow(unit.row);
    let fx = unit.x;
    for (const face of faces) {
      placements.push({
        card: face.card,
        x: Math.round(fx),
        y: Math.round(unit.y),
        width: cardW,
        height: cardH,
        showQuantity: face.showQuantity,
        pairRole: face.pairRole,
      });
      fx += cardW + (faces.length > 1 ? PAIR_INNER_GAP : 0);
    }
  }
  return placements;
}

function tryLayout(
  includeSet: SwapGlanceIncludeSet,
  cardW: number,
): { labels: SwapGlanceLabel[]; placements: SwapGlancePlacement[]; fits: boolean } | null {
  const contentTop = SWAP_GLANCE_TITLE_HEIGHT + CONTENT_MARGIN_Y;
  const contentBottom = SWAP_GLANCE_CANVAS_HEIGHT - SWAP_GLANCE_WATERMARK_HEIGHT - CONTENT_MARGIN_Y;
  const contentLeft = CONTENT_MARGIN_X;
  const contentWidth = SWAP_GLANCE_CANVAS_WIDTH - CONTENT_MARGIN_X * 2;
  const contentHeight = contentBottom - contentTop;
  if (contentHeight < SECTION_HEADER_HEIGHT + cardHeightForWidth(cardW)) return null;

  const labels: SwapGlanceLabel[] = [
    {
      text: 'Swaps at a glance',
      x: CONTENT_MARGIN_X,
      y: Math.round((SWAP_GLANCE_TITLE_HEIGHT - 40) / 2),
      role: 'title',
    },
  ];
  const placements: SwapGlancePlacement[] = [];

  // Equal vertical budget per section (simple + predictable)
  const sectionCount = includeSet.sections.length;
  const totalGap = SECTION_GAP * Math.max(0, sectionCount - 1);
  const sectionBudget = (contentHeight - totalGap) / sectionCount;
  if (sectionBudget < SECTION_HEADER_HEIGHT + cardHeightForWidth(cardW)) {
    return null;
  }

  let cursorY = contentTop;
  let anyOmitted = false;

  for (const section of includeSet.sections) {
    labels.push({
      text: section.headerText,
      x: contentLeft,
      y: Math.round(cursorY),
      role: 'section',
    });
    const bandTop = cursorY + SECTION_HEADER_HEIGHT;
    const bandHeight = sectionBudget - SECTION_HEADER_HEIGHT;
    const packed = packRows(
      section.rows,
      contentLeft,
      bandTop,
      contentWidth,
      bandHeight,
      cardW,
    );
    placements.push(...placementsFromUnits(packed.units, cardW));
    if (packed.omitted > 0) {
      anyOmitted = true;
      labels.push({
        text: `+${packed.omitted} more`,
        x: contentLeft,
        y: Math.round(bandTop + bandHeight - 22),
        role: 'more',
      });
    }
    cursorY += sectionBudget + SECTION_GAP;
  }

  return { labels, placements, fits: !anyOmitted && placements.length > 0 };
}

/**
 * Build a 1920×1080 layout: title bar, per-deck text headers, scaled card grid.
 * Shrinks cards until everything fits; if still overflowing at min size, shows +N more.
 */
export function buildSwapGlanceLayoutPlan(
  includeSet: SwapGlanceIncludeSet,
): SwapGlanceLayoutPlan {
  let best: { labels: SwapGlanceLabel[]; placements: SwapGlancePlacement[] } | null = null;

  for (let cardW = SWAP_GLANCE_CARD_WIDTH; cardW >= MIN_CARD_WIDTH; cardW -= 4) {
    const attempt = tryLayout(includeSet, cardW);
    if (!attempt) continue;
    best = { labels: attempt.labels, placements: attempt.placements };
    if (attempt.fits) break;
  }

  if (!best) {
    // Absolute fallback: title only + first few faces at min size
    const attempt = tryLayout(includeSet, MIN_CARD_WIDTH);
    best = attempt
      ? { labels: attempt.labels, placements: attempt.placements }
      : {
          labels: [
            {
              text: 'Swaps at a glance',
              x: CONTENT_MARGIN_X,
              y: Math.round((SWAP_GLANCE_TITLE_HEIGHT - 40) / 2),
              role: 'title',
            },
          ],
          placements: [],
        };
  }

  return {
    layoutVersion: SWAP_GLANCE_GENERATION_VERSION,
    canvasWidth: SWAP_GLANCE_CANVAS_WIDTH,
    canvasHeight: SWAP_GLANCE_CANVAS_HEIGHT,
    labels: best.labels,
    placements: best.placements,
    fingerprint: swapGlanceFingerprint(includeSet),
  };
}

export { SECTION_HEADER_HEIGHT, MIN_CARD_WIDTH };
