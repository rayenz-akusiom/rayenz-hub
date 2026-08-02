import { swapGlanceFingerprint } from './fingerprint.js';
import type {
  SwapGlanceCard,
  SwapGlanceConnector,
  SwapGlanceIncludeSet,
  SwapGlanceLabel,
  SwapGlanceLayoutPlan,
  SwapGlancePlacement,
  SwapGlanceRow,
} from './types.js';
import {
  SWAP_GLANCE_CANVAS_HEIGHT,
  SWAP_GLANCE_CANVAS_WIDTH,
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
const COL_GAP = 16;
const SECTION_HEADER_HEIGHT = 32;
const CARD_GAP = 8;
/** Gap between Out and In faces inside a pair (connector sits in this slot). */
const PAIR_INNER_GAP = 32;
/** Gap between adjacent pair groups. */
const PAIR_GROUP_GAP = 28;
const CARD_ASPECT = 61 / 85;
const MIN_CARD_WIDTH = 56;
/** Reserved band for a bottom "+N more decks" overflow label. */
const SECTION_OVERFLOW_LABEL_H = 22;

type FaceSlot = {
  card: SwapGlanceCard;
  pairRole: 'out' | 'in' | 'single';
  showQuantity: boolean;
  showProxy: boolean;
};

type LayoutAttempt = {
  labels: SwapGlanceLabel[];
  placements: SwapGlancePlacement[];
  connectors: SwapGlanceConnector[];
  fits: boolean;
};

function facesFromRow(row: SwapGlanceRow): FaceSlot[] {
  if (row.kind === 'single') {
    return [
      {
        card: row.card,
        pairRole: 'single',
        showQuantity: row.card.quantity > 1,
        showProxy: false,
      },
    ];
  }
  const faces: FaceSlot[] = [];
  if (row.out) {
    faces.push({
      card: row.out,
      pairRole: 'out',
      showQuantity: row.out.quantity > 1,
      showProxy: Boolean(row.out.proxy),
    });
  }
  if (row.in) {
    faces.push({
      card: row.in,
      pairRole: 'in',
      showQuantity: row.in.quantity > 1,
      showProxy: false,
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

/** Height of the card band when all rows pack into `bandWidth` (no height cap). */
function measurePackedHeight(rows: SwapGlanceRow[], bandWidth: number, cardW: number): number {
  if (!rows.length) return 0;
  const cardH = cardHeightForWidth(cardW);
  const packed = packRows(rows, 0, 0, bandWidth, Number.POSITIVE_INFINITY, cardW);
  if (!packed.units.length) return cardH;
  let maxBottom = 0;
  for (const unit of packed.units) {
    maxBottom = Math.max(maxBottom, unit.y + cardH);
  }
  return maxBottom;
}

function placementsFromUnits(
  units: PackedUnit[],
  cardW: number,
): { placements: SwapGlancePlacement[]; connectors: SwapGlanceConnector[] } {
  const cardH = cardHeightForWidth(cardW);
  const placements: SwapGlancePlacement[] = [];
  const connectors: SwapGlanceConnector[] = [];
  for (const unit of units) {
    const faces = facesFromRow(unit.row);
    let fx = unit.x;
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i]!;
      placements.push({
        card: face.card,
        x: Math.round(fx),
        y: Math.round(unit.y),
        width: cardW,
        height: cardH,
        showQuantity: face.showQuantity,
        showProxy: face.showProxy,
        pairRole: face.pairRole,
      });
      const next = faces[i + 1];
      if (!next) continue;
      if (face.pairRole === 'out' && next.pairRole === 'in') {
        connectors.push({
          x: Math.round(fx + cardW),
          y: Math.round(unit.y),
          width: PAIR_INNER_GAP,
          height: cardH,
        });
      }
      fx += cardW + PAIR_INNER_GAP;
    }
  }
  return { placements, connectors };
}

function titleLabels(): SwapGlanceLabel[] {
  return [
    {
      text: 'Swaps at a glance',
      x: CONTENT_MARGIN_X,
      y: Math.round((SWAP_GLANCE_TITLE_HEIGHT - 40) / 2),
      role: 'title',
    },
  ];
}

function maxColumnsFor(contentWidth: number, cardW: number): number {
  return Math.max(1, Math.floor((contentWidth + COL_GAP) / (cardW + COL_GAP)));
}

function shortestColumnIndex(heights: number[]): number {
  let best = 0;
  for (let i = 1; i < heights.length; i++) {
    if (heights[i]! < heights[best]!) best = i;
  }
  return best;
}

/**
 * Multi-column masonry: each deck is a header + card block assigned to the
 * shortest column. When `allowOmit` is false, every section must fit fully.
 */
function tryMasonryLayout(
  includeSet: SwapGlanceIncludeSet,
  cardW: number,
  colCount: number,
  allowOmit: boolean,
): LayoutAttempt | null {
  const contentTop = SWAP_GLANCE_TITLE_HEIGHT + CONTENT_MARGIN_Y;
  const contentBottom = SWAP_GLANCE_CANVAS_HEIGHT - SWAP_GLANCE_WATERMARK_HEIGHT - CONTENT_MARGIN_Y;
  const contentLeft = CONTENT_MARGIN_X;
  const contentWidth = SWAP_GLANCE_CANVAS_WIDTH - CONTENT_MARGIN_X * 2;
  const contentHeight = contentBottom - contentTop;
  const cardH = cardHeightForWidth(cardW);
  const minSectionH = SECTION_HEADER_HEIGHT + cardH;
  if (contentHeight < minSectionH) return null;
  if (colCount < 1) return null;

  const allSections = includeSet.sections;
  const labels = titleLabels();
  if (!allSections.length) {
    return { labels, placements: [], connectors: [], fits: false };
  }

  const colWidth = (contentWidth - COL_GAP * (colCount - 1)) / colCount;
  if (colWidth < cardW) return null;

  const usableHeight = allowOmit ? contentHeight - SECTION_OVERFLOW_LABEL_H : contentHeight;
  const colHeights = Array.from({ length: colCount }, () => 0);
  const placements: SwapGlancePlacement[] = [];
  const connectors: SwapGlanceConnector[] = [];
  let placedSections = 0;
  let anyRowOmitted = false;

  for (const section of allSections) {
    const ci = shortestColumnIndex(colHeights);
    const colX = contentLeft + ci * (colWidth + COL_GAP);
    const used = colHeights[ci]!;
    const gapBefore = used > 0 ? SECTION_GAP : 0;
    const blockTop = contentTop + used + gapBefore;
    const remaining = contentTop + usableHeight - blockTop;
    if (remaining < minSectionH) {
      if (!allowOmit) return null;
      break;
    }

    const fullBlockH = SECTION_HEADER_HEIGHT + measurePackedHeight(section.rows, colWidth, cardW);
    const needsTruncate = fullBlockH > remaining;
    if (needsTruncate && !allowOmit) return null;

    const bandHeight = remaining - SECTION_HEADER_HEIGHT;
    const bandTop = blockTop + SECTION_HEADER_HEIGHT;
    const packed = packRows(section.rows, colX, bandTop, colWidth, bandHeight, cardW);
    if (section.rows.length > 0 && packed.units.length === 0) {
      if (!allowOmit) return null;
      break;
    }
    if (packed.omitted > 0) {
      if (!allowOmit) return null;
      anyRowOmitted = true;
    }

    labels.push({
      text: section.headerText,
      x: Math.round(colX),
      y: Math.round(blockTop),
      role: 'section',
    });
    const placed = placementsFromUnits(packed.units, cardW);
    placements.push(...placed.placements);
    connectors.push(...placed.connectors);
    if (packed.omitted > 0) {
      labels.push({
        text: `+${packed.omitted} more`,
        x: Math.round(colX),
        y: Math.round(bandTop + bandHeight - 22),
        role: 'more',
      });
    }

    let cardsBottom = bandTop;
    if (packed.units.length) {
      for (const unit of packed.units) {
        cardsBottom = Math.max(cardsBottom, unit.y + cardH);
      }
    }
    const blockH =
      packed.units.length > 0
        ? cardsBottom - blockTop
        : SECTION_HEADER_HEIGHT;
    colHeights[ci] = blockTop + blockH - contentTop;
    placedSections += 1;
  }

  const omittedSections = allSections.length - placedSections;
  if (omittedSections > 0) {
    if (!allowOmit) return null;
    labels.push({
      text: `+${omittedSections} more decks`,
      x: contentLeft,
      y: Math.round(contentBottom - SECTION_OVERFLOW_LABEL_H),
      role: 'more',
    });
  }

  const fits = omittedSections === 0 && !anyRowOmitted && placements.length > 0;
  return { labels, placements, connectors, fits };
}

/** Absolute fallback overflow path when no full fit exists. */
function tryLayoutAllowOmit(
  includeSet: SwapGlanceIncludeSet,
  cardW: number,
): LayoutAttempt | null {
  const contentWidth = SWAP_GLANCE_CANVAS_WIDTH - CONTENT_MARGIN_X * 2;
  const maxCols = maxColumnsFor(contentWidth, cardW);
  let best: LayoutAttempt | null = null;
  for (let colCount = maxCols; colCount >= 1; colCount--) {
    const attempt = tryMasonryLayout(includeSet, cardW, colCount, true);
    if (!attempt) continue;
    if (
      !best ||
      attempt.placements.length > best.placements.length ||
      (attempt.placements.length === best.placements.length && attempt.fits && !best.fits)
    ) {
      best = attempt;
    }
    if (attempt.fits) break;
  }
  return best;
}

/**
 * Build a 1920×1080 layout: title bar, multi-column deck-block masonry.
 * Shrinks cards until everything fits; if still overflowing at min size, shows +N more.
 */
export function buildSwapGlanceLayoutPlan(
  includeSet: SwapGlanceIncludeSet,
): SwapGlanceLayoutPlan {
  const contentWidth = SWAP_GLANCE_CANVAS_WIDTH - CONTENT_MARGIN_X * 2;
  let best: LayoutAttempt | null = null;

  for (let cardW = SWAP_GLANCE_CARD_WIDTH; cardW >= MIN_CARD_WIDTH; cardW -= 4) {
    const maxCols = maxColumnsFor(contentWidth, cardW);
    for (let colCount = maxCols; colCount >= 1; colCount--) {
      const attempt = tryMasonryLayout(includeSet, cardW, colCount, false);
      if (!attempt) continue;
      if (attempt.fits) {
        best = attempt;
        break;
      }
    }
    if (best?.fits) break;
  }

  if (!best?.fits) {
    const overflow = tryLayoutAllowOmit(includeSet, MIN_CARD_WIDTH);
    if (overflow && (!best || overflow.placements.length >= best.placements.length)) {
      best = overflow;
    }
  }

  if (!best) {
    best = {
      labels: titleLabels(),
      placements: [],
      connectors: [],
      fits: false,
    };
  }

  return {
    layoutVersion: SWAP_GLANCE_GENERATION_VERSION,
    canvasWidth: SWAP_GLANCE_CANVAS_WIDTH,
    canvasHeight: SWAP_GLANCE_CANVAS_HEIGHT,
    filterSetCodes: includeSet.filterSetCodes || [],
    labels: best.labels,
    placements: best.placements,
    connectors: best.connectors,
    fingerprint: swapGlanceFingerprint(includeSet),
  };
}

export { SECTION_HEADER_HEIGHT, MIN_CARD_WIDTH, PAIR_INNER_GAP, PAIR_GROUP_GAP };
