import {
  GLANCE_CANVAS_HEIGHT,
  GLANCE_CANVAS_WIDTH,
  GLANCE_CARD_WIDTH,
  GLANCE_HEADER_HEIGHT,
  GLANCE_WATERMARK_HEIGHT,
  glanceCardHeightForWidth,
} from '../glance/plate.js';
import type {
  SwapGlanceConnector,
  SwapGlancePackMode,
  SwapGlancePlacement,
  SwapGlanceSection,
} from './types.js';
import {
  COL_GAP,
  CONTENT_MARGIN_X,
  CONTENT_MARGIN_Y,
  SECTION_GAP,
  SECTION_HEADER_HEIGHT,
  SECTION_OVERFLOW_LABEL_H,
  cardFaceCount,
  maxColumnsFor,
  sectionFaceCount,
  shortestColumnIndex,
  titleLabels,
  unitWidth,
  type LayoutAttempt,
} from './layout-shared.js';
import { measurePackedHeight, packRows, placementsFromUnits } from './pack.js';

/**
 * Multi-column masonry for a list of sections on one page region.
 * When `allowOmit` is false, every section must fit fully.
 */
function tryMasonryLayout(
  sections: SwapGlanceSection[],
  cardW: number,
  colCount: number,
  packMode: SwapGlancePackMode,
  allowOmit: boolean,
  pageIndex: number,
  pageCount: number,
  reservedBottomLabel: boolean,
): LayoutAttempt | null {
  const contentTop = GLANCE_HEADER_HEIGHT + CONTENT_MARGIN_Y;
  const contentBottom = GLANCE_CANVAS_HEIGHT - GLANCE_WATERMARK_HEIGHT - CONTENT_MARGIN_Y;
  const contentLeft = CONTENT_MARGIN_X;
  const contentWidth = GLANCE_CANVAS_WIDTH - CONTENT_MARGIN_X * 2;
  const contentHeight = contentBottom - contentTop;
  const cardH = glanceCardHeightForWidth(cardW);
  const minSectionH = SECTION_HEADER_HEIGHT + cardH;
  if (contentHeight < minSectionH) return null;
  if (colCount < 1) return null;

  const labels = titleLabels(pageIndex, pageCount);
  if (!sections.length) {
    return { labels, placements: [], connectors: [], fits: true, omittedCards: 0 };
  }

  const colWidth = (contentWidth - COL_GAP * (colCount - 1)) / colCount;
  const minUnitW = maxPairUnitWidth(sections, cardW);
  if (colWidth < minUnitW) return null;

  const usableHeight = reservedBottomLabel || allowOmit
    ? contentHeight - SECTION_OVERFLOW_LABEL_H
    : contentHeight;
  const colHeights = Array.from({ length: colCount }, () => 0);
  const placements: SwapGlancePlacement[] = [];
  const connectors: SwapGlanceConnector[] = [];
  let placedSections = 0;
  let omittedCards = 0;
  let anyRowOmitted = false;

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si]!;
    const ci = shortestColumnIndex(colHeights);
    const colX = contentLeft + ci * (colWidth + COL_GAP);
    const used = colHeights[ci]!;
    const gapBefore = used > 0 ? SECTION_GAP : 0;
    const blockTop = contentTop + used + gapBefore;
    const remaining = contentTop + usableHeight - blockTop;
    if (remaining < minSectionH) {
      if (!allowOmit) return null;
      for (let i = si; i < sections.length; i++) {
        omittedCards += sectionFaceCount(sections[i]!);
      }
      break;
    }

    const fullBlockH =
      SECTION_HEADER_HEIGHT + measurePackedHeight(section.rows, colWidth, cardW, packMode);
    const needsTruncate = fullBlockH > remaining;
    if (needsTruncate && !allowOmit) return null;

    const bandHeight = remaining - SECTION_HEADER_HEIGHT;
    const bandTop = blockTop + SECTION_HEADER_HEIGHT;
    const packed = packRows(section.rows, colX, bandTop, colWidth, bandHeight, cardW, packMode);
    if (section.rows.length > 0 && packed.units.length === 0) {
      if (!allowOmit) return null;
      for (let i = si; i < sections.length; i++) {
        omittedCards += sectionFaceCount(sections[i]!);
      }
      break;
    }
    if (packed.omittedRows.length > 0) {
      if (!allowOmit) return null;
      anyRowOmitted = true;
      omittedCards += packed.omittedRows.reduce((n, r) => n + cardFaceCount(r), 0);
    }

    labels.push({
      text: section.headerText,
      x: Math.round(colX),
      y: Math.round(blockTop),
      role: 'section',
      maxWidth: Math.max(40, Math.floor(colWidth)),
    });
    const placed = placementsFromUnits(packed.units, cardW);
    placements.push(...placed.placements);
    connectors.push(...placed.connectors);
    if (packed.omittedRows.length > 0) {
      const n = packed.omittedRows.reduce((sum, r) => sum + cardFaceCount(r), 0);
      labels.push({
        text: `+${n} more`,
        x: Math.round(colX),
        y: Math.round(bandTop + bandHeight - 22),
        role: 'more',
        maxWidth: Math.max(40, Math.floor(colWidth)),
      });
    }

    let cardsBottom = bandTop;
    if (packed.units.length) {
      for (const unit of packed.units) {
        cardsBottom = Math.max(cardsBottom, unit.y + cardH);
      }
    }
    const blockH =
      packed.units.length > 0 ? cardsBottom - blockTop : SECTION_HEADER_HEIGHT;
    colHeights[ci] = blockTop + blockH - contentTop;
    placedSections += 1;

    // If we truncated mid-section, remaining sections are also omitted.
    if (packed.omittedRows.length > 0) {
      for (let i = si + 1; i < sections.length; i++) {
        omittedCards += sectionFaceCount(sections[i]!);
      }
      break;
    }
  }

  const omittedSections = sections.length - placedSections;
  if (omittedSections > 0 && !allowOmit) return null;

  const fits = omittedSections === 0 && !anyRowOmitted && omittedCards === 0;
  return { labels, placements, connectors, fits, omittedCards };
}

function maxPairUnitWidth(sections: SwapGlanceSection[], cardW: number): number {
  let max = cardW;
  for (const section of sections) {
    for (const row of section.rows) {
      max = Math.max(max, unitWidth(row, cardW));
    }
  }
  return max;
}

function countPlacementOverlaps(placements: SwapGlancePlacement[]): number {
  let overlaps = 0;
  for (let i = 0; i < placements.length; i++) {
    const a = placements[i]!;
    for (let j = i + 1; j < placements.length; j++) {
      const b = placements[j]!;
      const ax2 = a.x + a.width;
      const ay2 = a.y + a.height;
      const bx2 = b.x + b.width;
      const by2 = b.y + b.height;
      const intersect = a.x < bx2 && ax2 > b.x && a.y < by2 && ay2 > b.y;
      if (!intersect) continue;
      const sameCol = a.x === b.x;
      const stackedPeek = sameCol && Math.abs(a.y - b.y) < a.height;
      if (stackedPeek) continue;
      overlaps += 1;
    }
  }
  return overlaps;
}

export function bestMasonryForSections(
  sections: SwapGlanceSection[],
  packMode: SwapGlancePackMode,
  allowOmit: boolean,
  pageIndex: number,
  pageCount: number,
  reservedBottomLabel: boolean,
): LayoutAttempt | null {
  const cardW = GLANCE_CARD_WIDTH;
  const contentWidth = GLANCE_CANVAS_WIDTH - CONTENT_MARGIN_X * 2;
  const pairW = maxPairUnitWidth(sections, cardW);
  const maxCols = maxColumnsFor(contentWidth, pairW);
  let best: LayoutAttempt | null = null;
  for (let colCount = maxCols; colCount >= 1; colCount--) {
    const attempt = tryMasonryLayout(
      sections,
      cardW,
      colCount,
      packMode,
      allowOmit,
      pageIndex,
      pageCount,
      reservedBottomLabel,
    );
    if (!attempt) continue;
    const overlaps = countPlacementOverlaps(attempt.placements);
    // Overlapping faces are never a valid fit (pair overflow into neighboring columns).
    if (overlaps > 0 && !allowOmit) continue;
    if (overlaps > 0 && allowOmit) {
      attempt.fits = false;
    }
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
 * Greedy: walk sections in order, packing as many as fit on the current page,
 * then advance. Returns null if sections cannot fit in `pageCount` without omit
 * (unless allowOmit on the last page).
 */
export function packCategoryAcrossPages(
  sections: SwapGlanceSection[],
  packMode: SwapGlancePackMode,
  startPage: number,
  pageCount: number,
  allowOmitOnLast: boolean,
): { pages: Map<number, SwapGlanceSection[]>; omitted: SwapGlanceSection[]; ok: boolean } | null {
  if (!sections.length) {
    return { pages: new Map(), omitted: [], ok: true };
  }
  const pages = new Map<number, SwapGlanceSection[]>();
  let page = startPage;
  let remaining = [...sections];

  while (remaining.length && page <= pageCount) {
    // Binary-ish: take as many sections as fit on this page.
    let lo = 1;
    let hi = remaining.length;
    let bestTake = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const slice = remaining.slice(0, mid);
      const attempt = bestMasonryForSections(
        slice,
        packMode,
        false,
        page,
        pageCount,
        false,
      );
      if (attempt?.fits) {
        bestTake = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (bestTake === 0) {
      // Nothing fits fully — if last page and allowOmit, dump the rest.
      if (page === pageCount && allowOmitOnLast) {
        pages.set(page, remaining);
        return { pages, omitted: [], ok: false };
      }
      // Try next page if available
      if (page < pageCount) {
        page += 1;
        continue;
      }
      return { pages, omitted: remaining, ok: false };
    }

    pages.set(page, remaining.slice(0, bestTake));
    remaining = remaining.slice(bestTake);
    if (remaining.length) page += 1;
  }

  if (remaining.length) {
    return { pages, omitted: remaining, ok: false };
  }
  return { pages, omitted: [], ok: true };
}
