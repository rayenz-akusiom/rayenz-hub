import {
  GLANCE_HEADER_HEIGHT,
} from '../glance/plate.js';
import type {
  SwapGlanceCard,
  SwapGlanceConnector,
  SwapGlanceDensifyStage,
  SwapGlanceLabel,
  SwapGlancePackMode,
  SwapGlancePlacement,
  SwapGlanceRow,
  SwapGlanceSection,
} from './types.js';

export const CONTENT_MARGIN_X = 24;
export const CONTENT_MARGIN_Y = 16;
export const SECTION_GAP = 14;
export const COL_GAP = 16;
export const SECTION_HEADER_HEIGHT = 32;
export const CARD_GAP = 8;
/** Gap between Out and In faces inside a pair (connector sits in this slot). */
export const PAIR_INNER_GAP = 32;
/** Gap between adjacent pair groups. */
export const PAIR_GROUP_GAP = 28;
/** Reserved band for a bottom "+N cards" overflow label. */
export const SECTION_OVERFLOW_LABEL_H = 22;

export type FaceSlot = {
  card: SwapGlanceCard;
  pairRole: 'out' | 'in' | 'single';
  showQuantity: boolean;
  showProxy: boolean;
};

export type LayoutAttempt = {
  labels: SwapGlanceLabel[];
  placements: SwapGlancePlacement[];
  connectors: SwapGlanceConnector[];
  fits: boolean;
  omittedCards: number;
};

export type DensifyConfig = {
  stage: SwapGlanceDensifyStage;
  seekingMode: SwapGlancePackMode;
  lookingForMode: SwapGlancePackMode;
  convertPairsToLookingFor: boolean;
};

export type PackedUnit = {
  row: SwapGlanceRow;
  x: number;
  y: number;
};

export function facesFromRow(row: SwapGlanceRow): FaceSlot[] {
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

export function cardFaceCount(row: SwapGlanceRow): number {
  return facesFromRow(row).length;
}

export function sectionFaceCount(section: SwapGlanceSection): number {
  return section.rows.reduce((n, r) => n + cardFaceCount(r), 0);
}

/** Width of one logical unit (single face or Out+In pair) at a given card width. */
export function unitWidth(row: SwapGlanceRow, cardW: number): number {
  if (row.kind === 'single') return cardW;
  const faces = (row.out ? 1 : 0) + (row.in ? 1 : 0);
  if (faces <= 1) return cardW;
  return cardW * 2 + PAIR_INNER_GAP;
}

export function titleLabels(pageIndex: number, pageCount: number): SwapGlanceLabel[] {
  const text =
    pageCount > 1 ? `Swaps at a glance (${pageIndex}/${pageCount})` : 'Swaps at a glance';
  return [
    {
      text,
      x: CONTENT_MARGIN_X,
      y: Math.round((GLANCE_HEADER_HEIGHT - 40) / 2),
      role: 'title',
    },
  ];
}

export function maxColumnsFor(contentWidth: number, minUnitW: number): number {
  return Math.max(1, Math.floor((contentWidth + COL_GAP) / (minUnitW + COL_GAP)));
}

export function shortestColumnIndex(heights: number[]): number {
  let best = 0;
  for (let i = 1; i < heights.length; i++) {
    if (heights[i]! < heights[best]!) best = i;
  }
  return best;
}
