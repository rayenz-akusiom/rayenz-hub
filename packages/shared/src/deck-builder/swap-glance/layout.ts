import { swapGlanceFingerprint } from './fingerprint.js';
import type {
  SwapGlanceCard,
  SwapGlanceConnector,
  SwapGlanceDensifyStage,
  SwapGlanceIncludeSet,
  SwapGlanceLabel,
  SwapGlanceLayoutPlan,
  SwapGlanceLayoutResult,
  SwapGlancePackMode,
  SwapGlancePlacement,
  SwapGlanceRow,
  SwapGlanceSection,
} from './types.js';
import {
  SWAP_GLANCE_CANVAS_HEIGHT,
  SWAP_GLANCE_CANVAS_WIDTH,
  SWAP_GLANCE_CARD_HEIGHT,
  SWAP_GLANCE_CARD_WIDTH,
  SWAP_GLANCE_GENERATION_VERSION,
  SWAP_GLANCE_MAX_PAGES,
  SWAP_GLANCE_TITLE_HEIGHT,
  SWAP_GLANCE_WATERMARK_HEIGHT,
} from './types.js';
import {
  glanceCardHeightForWidth,
  glanceMaxStackedRows,
  glanceTitlePeek,
} from '../glance/plate.js';

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
/** Reserved band for a bottom "+N cards" overflow label. */
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
  omittedCards: number;
};

type DensifyConfig = {
  stage: SwapGlanceDensifyStage;
  seekingMode: SwapGlancePackMode;
  lookingForMode: SwapGlancePackMode;
  convertPairsToLookingFor: boolean;
};

const DENSIFY_LADDER: DensifyConfig[] = [
  {
    stage: 'base',
    seekingMode: 'grid',
    lookingForMode: 'grid',
    convertPairsToLookingFor: false,
  },
  {
    stage: 'seeking_stacked',
    seekingMode: 'stacked',
    lookingForMode: 'grid',
    convertPairsToLookingFor: false,
  },
  {
    stage: 'looking_for_stacked',
    seekingMode: 'stacked',
    lookingForMode: 'stacked',
    convertPairsToLookingFor: false,
  },
  {
    stage: 'swaps_to_looking_for_grid',
    seekingMode: 'stacked',
    lookingForMode: 'grid',
    convertPairsToLookingFor: true,
  },
  {
    stage: 'swaps_to_looking_for_stacked',
    seekingMode: 'stacked',
    lookingForMode: 'stacked',
    convertPairsToLookingFor: true,
  },
];

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

function cardFaceCount(row: SwapGlanceRow): number {
  return facesFromRow(row).length;
}

function sectionFaceCount(section: SwapGlanceSection): number {
  return section.rows.reduce((n, r) => n + cardFaceCount(r), 0);
}

/** Width of one logical unit (single face or Out+In pair) at a given card width. */
function unitWidth(row: SwapGlanceRow, cardW: number): number {
  if (row.kind === 'single') return cardW;
  const faces = (row.out ? 1 : 0) + (row.in ? 1 : 0);
  if (faces <= 1) return cardW;
  return cardW * 2 + PAIR_INNER_GAP;
}

function cardHeightForWidth(cardW: number): number {
  return glanceCardHeightForWidth(cardW);
}

const peekFor = glanceTitlePeek;
const maxStackedRows = glanceMaxStackedRows;

type PackedUnit = {
  row: SwapGlanceRow;
  x: number;
  y: number;
};

/**
 * Pack rows into a band (non-overlapping wrap grid); returns placed units and omitted rows.
 */
function packRowsGrid(
  rows: SwapGlanceRow[],
  originX: number,
  originY: number,
  bandWidth: number,
  bandHeight: number,
  cardW: number,
): { units: PackedUnit[]; omittedRows: SwapGlanceRow[] } {
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
      return { units, omittedRows: rows.slice(placed) };
    }
    units.push({ row, x, y });
    placed += 1;
    x += w + gap;
  }
  return { units, omittedRows: [] };
}

/** Height of the card band when all rows pack into `bandWidth` (no height cap). */
function measurePackedHeightGrid(rows: SwapGlanceRow[], bandWidth: number, cardW: number): number {
  if (!rows.length) return 0;
  const cardH = cardHeightForWidth(cardW);
  const packed = packRowsGrid(rows, 0, 0, bandWidth, Number.POSITIVE_INFINITY, cardW);
  if (!packed.units.length) return cardH;
  let maxBottom = 0;
  for (const unit of packed.units) {
    maxBottom = Math.max(maxBottom, unit.y + cardH);
  }
  return maxBottom;
}

/**
 * Pack single-face rows as overlapping title-peek stacks across columns.
 * Pair rows fall back to grid packing (should not appear in stacked categories).
 */
function packRowsStacked(
  rows: SwapGlanceRow[],
  originX: number,
  originY: number,
  bandWidth: number,
  bandHeight: number,
  cardW: number,
): { units: PackedUnit[]; omittedRows: SwapGlanceRow[] } {
  const singles = rows.filter((r) => r.kind === 'single');
  const pairs = rows.filter((r) => r.kind === 'pair');
  if (pairs.length) {
    // Defensive: pairs cannot stack — pack them as grid first, then stack singles below.
    const pairPack = packRowsGrid(pairs, originX, originY, bandWidth, bandHeight, cardW);
    const cardH = cardHeightForWidth(cardW);
    let usedBottom = originY;
    for (const u of pairPack.units) {
      usedBottom = Math.max(usedBottom, u.y + cardH);
    }
    const nextY = pairPack.units.length ? usedBottom + CARD_GAP : originY;
    const remainH = originY + bandHeight - nextY;
    if (remainH < cardH || !singles.length) {
      return {
        units: pairPack.units,
        omittedRows: [...pairPack.omittedRows, ...singles],
      };
    }
    const singlePack = packRowsStacked(singles, originX, nextY, bandWidth, remainH, cardW);
    return {
      units: [...pairPack.units, ...singlePack.units],
      omittedRows: [...pairPack.omittedRows, ...singlePack.omittedRows],
    };
  }

  const cardH = cardHeightForWidth(cardW);
  const peek = peekFor(cardH);
  const colStride = cardW + COL_GAP;
  const colCount = Math.max(1, Math.floor((bandWidth + COL_GAP) / colStride));
  const maxRows = maxStackedRows(bandHeight, cardH);
  if (maxRows <= 0) {
    return { units: [], omittedRows: rows };
  }
  const capacity = colCount * maxRows;
  const take = Math.min(singles.length, capacity);
  const placedRows = singles.slice(0, take);
  const omittedRows = singles.slice(take);
  const units: PackedUnit[] = [];

  // Fill columns top-to-bottom, left-to-right, balanced by capacity.
  const counts = Array.from({ length: colCount }, () => 0);
  for (let i = 0; i < placedRows.length; i++) {
    let best = 0;
    for (let c = 1; c < colCount; c++) {
      if (counts[c]! < counts[best]!) best = c;
    }
    if (counts[best]! >= maxRows) {
      // Should not happen given capacity check; treat as omit.
      omittedRows.push(...placedRows.slice(i));
      break;
    }
    const row = placedRows[i]!;
    const col = best;
    const stackIndex = counts[col]!;
    units.push({
      row,
      x: originX + col * colStride,
      y: originY + stackIndex * peek,
    });
    counts[col]! += 1;
  }

  return { units, omittedRows };
}

function measurePackedHeightStacked(rows: SwapGlanceRow[], bandWidth: number, cardW: number): number {
  if (!rows.length) return 0;
  const cardH = cardHeightForWidth(cardW);
  const packed = packRowsStacked(rows, 0, 0, bandWidth, Number.POSITIVE_INFINITY, cardW);
  if (!packed.units.length) return cardH;
  let maxBottom = 0;
  for (const unit of packed.units) {
    maxBottom = Math.max(maxBottom, unit.y + cardH);
  }
  return maxBottom;
}

function packRows(
  rows: SwapGlanceRow[],
  originX: number,
  originY: number,
  bandWidth: number,
  bandHeight: number,
  cardW: number,
  mode: SwapGlancePackMode,
): { units: PackedUnit[]; omittedRows: SwapGlanceRow[] } {
  return mode === 'stacked'
    ? packRowsStacked(rows, originX, originY, bandWidth, bandHeight, cardW)
    : packRowsGrid(rows, originX, originY, bandWidth, bandHeight, cardW);
}

function measurePackedHeight(
  rows: SwapGlanceRow[],
  bandWidth: number,
  cardW: number,
  mode: SwapGlancePackMode,
): number {
  return mode === 'stacked'
    ? measurePackedHeightStacked(rows, bandWidth, cardW)
    : measurePackedHeightGrid(rows, bandWidth, cardW);
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

function titleLabels(pageIndex: number, pageCount: number): SwapGlanceLabel[] {
  const text =
    pageCount > 1 ? `Swaps at a glance (${pageIndex}/${pageCount})` : 'Swaps at a glance';
  return [
    {
      text,
      x: CONTENT_MARGIN_X,
      y: Math.round((SWAP_GLANCE_TITLE_HEIGHT - 40) / 2),
      role: 'title',
    },
  ];
}

function maxColumnsFor(contentWidth: number, minUnitW: number): number {
  return Math.max(1, Math.floor((contentWidth + COL_GAP) / (minUnitW + COL_GAP)));
}

function shortestColumnIndex(heights: number[]): number {
  let best = 0;
  for (let i = 1; i < heights.length; i++) {
    if (heights[i]! < heights[best]!) best = i;
  }
  return best;
}

function convertPairsToLookingFor(sections: SwapGlanceSection[]): SwapGlanceSection[] {
  return sections
    .map((section) => {
      const rows: SwapGlanceRow[] = [];
      for (const row of section.rows) {
        if (row.kind === 'pair') {
          if (row.in) {
            rows.push({
              kind: 'single',
              entryId: row.entryId,
              sourceKind: 'queued_in',
              card: row.in,
            });
          }
          continue;
        }
        rows.push(row);
      }
      return { ...section, rows };
    })
    .filter((s) => s.rows.length > 0);
}

function isSeekingRow(row: SwapGlanceRow): boolean {
  return row.kind === 'single' && row.sourceKind === 'seeking';
}

function isFormalRow(row: SwapGlanceRow): boolean {
  return !isSeekingRow(row);
}

function splitCategories(includeSet: SwapGlanceIncludeSet): {
  formal: SwapGlanceSection[];
  seeking: SwapGlanceSection[];
} {
  const formal: SwapGlanceSection[] = [];
  const seeking: SwapGlanceSection[] = [];
  for (const section of includeSet.sections) {
    const formalRows = section.rows.filter(isFormalRow);
    const seekingRows = section.rows.filter(isSeekingRow);
    if (formalRows.length) {
      formal.push({ ...section, rows: formalRows });
    }
    if (seekingRows.length) {
      seeking.push({ ...section, rows: seekingRows });
    }
  }
  return { formal, seeking };
}

function hasPairs(sections: SwapGlanceSection[]): boolean {
  return sections.some((s) => s.rows.some((r) => r.kind === 'pair'));
}

function hasLookingForSingles(sections: SwapGlanceSection[]): boolean {
  return sections.some((s) =>
    s.rows.some((r) => r.kind === 'single' && r.sourceKind === 'queued_in'),
  );
}

function hasSeeking(sections: SwapGlanceSection[]): boolean {
  return sections.some((s) => s.rows.some(isSeekingRow));
}

/** Stages that change nothing for this include set are skipped. */
function densifyLadderFor(includeSet: SwapGlanceIncludeSet): DensifyConfig[] {
  const { formal, seeking } = splitCategories(includeSet);
  const pairs = hasPairs(formal);
  const lookingFor = hasLookingForSingles(formal) || includeSet.mode === 'in_only';
  const seekingPresent = seeking.length > 0 || hasSeeking(includeSet.sections);

  return DENSIFY_LADDER.filter((cfg) => {
    if (cfg.stage === 'seeking_stacked' && !seekingPresent) return false;
    if (cfg.stage === 'looking_for_stacked') {
      // Only meaningful when looking-for singles exist (in_only) and are not already
      // going to be converted from pairs in a later stage-only path.
      if (!lookingFor && !pairs) return false;
      if (pairs && !lookingFor) return false; // full-mode pairs only — skip until convert
      return true;
    }
    if (
      (cfg.stage === 'swaps_to_looking_for_grid' ||
        cfg.stage === 'swaps_to_looking_for_stacked') &&
      !pairs
    ) {
      return false;
    }
    return true;
  });
}

function prepareCategories(
  includeSet: SwapGlanceIncludeSet,
  densify: DensifyConfig,
): { formal: SwapGlanceSection[]; seeking: SwapGlanceSection[]; formalMode: SwapGlancePackMode } {
  let { formal, seeking } = splitCategories(includeSet);
  if (densify.convertPairsToLookingFor) {
    formal = convertPairsToLookingFor(formal);
  }
  const formalMode: SwapGlancePackMode =
    densify.convertPairsToLookingFor || includeSet.mode === 'in_only' || !hasPairs(formal)
      ? densify.lookingForMode
      : 'grid';
  return { formal, seeking, formalMode };
}

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
  const contentTop = SWAP_GLANCE_TITLE_HEIGHT + CONTENT_MARGIN_Y;
  const contentBottom = SWAP_GLANCE_CANVAS_HEIGHT - SWAP_GLANCE_WATERMARK_HEIGHT - CONTENT_MARGIN_Y;
  const contentLeft = CONTENT_MARGIN_X;
  const contentWidth = SWAP_GLANCE_CANVAS_WIDTH - CONTENT_MARGIN_X * 2;
  const contentHeight = contentBottom - contentTop;
  const cardH = cardHeightForWidth(cardW);
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

function bestMasonryForSections(
  sections: SwapGlanceSection[],
  packMode: SwapGlancePackMode,
  allowOmit: boolean,
  pageIndex: number,
  pageCount: number,
  reservedBottomLabel: boolean,
): LayoutAttempt | null {
  const cardW = SWAP_GLANCE_CARD_WIDTH;
  const contentWidth = SWAP_GLANCE_CANVAS_WIDTH - CONTENT_MARGIN_X * 2;
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
function packCategoryAcrossPages(
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

type PageBuild = {
  attempts: LayoutAttempt[];
  usedPages: number;
  omittedCards: number;
  fits: boolean;
};

function buildPagesForDensify(
  includeSet: SwapGlanceIncludeSet,
  densify: DensifyConfig,
  pageCount: number,
  allowOmit: boolean,
): PageBuild | null {
  const { formal, seeking, formalMode } = prepareCategories(includeSet, densify);
  const seekingMode = densify.seekingMode;

  // Single-page budget: allow mixing both categories on page 1.
  if (pageCount === 1 && formal.length && seeking.length) {
    // One masonry pass: use stacked only when both categories are stacked;
    // otherwise grid so we do not densify looking-for early.
    const packMode: SwapGlancePackMode =
      formalMode === 'stacked' && seekingMode === 'stacked' ? 'stacked' : 'grid';
    const attempt = bestMasonryForSections(
      [...formal, ...seeking],
      packMode,
      allowOmit,
      1,
      1,
      allowOmit,
    );
    if (!attempt) return null;
    if (!attempt.fits && !allowOmit) return null;
    if (allowOmit && attempt.omittedCards > 0) {
      const contentBottom =
        SWAP_GLANCE_CANVAS_HEIGHT - SWAP_GLANCE_WATERMARK_HEIGHT - CONTENT_MARGIN_Y;
      if (!attempt.labels.some((l) => l.role === 'more' && /\+\d+ cards/.test(l.text))) {
        attempt.labels.push({
          text: `+${attempt.omittedCards} cards`,
          x: CONTENT_MARGIN_X,
          y: Math.round(contentBottom - SECTION_OVERFLOW_LABEL_H),
          role: 'more',
        });
      }
    }
    return {
      attempts: [attempt],
      usedPages: 1,
      omittedCards: attempt.omittedCards,
      fits: attempt.fits && attempt.omittedCards === 0,
    };
  }

  // Multi-page: category purity — formal pages first, then seeking pages.
  const formalPack = packCategoryAcrossPages(
    formal,
    formalMode,
    1,
    pageCount,
    allowOmit && seeking.length === 0,
  );
  if (!formalPack) return null;

  let seekingStart = 1;
  if (formal.length) {
    let lastFormalPage = 0;
    for (const p of formalPack.pages.keys()) {
      lastFormalPage = Math.max(lastFormalPage, p);
    }
    seekingStart = formalPack.ok ? lastFormalPage + 1 : lastFormalPage;
    if (formalPack.ok && seeking.length) {
      seekingStart = lastFormalPage + 1;
    }
  }

  const seekingPack =
    seeking.length && seekingStart <= pageCount
      ? packCategoryAcrossPages(
          seeking,
          seekingMode,
          seekingStart,
          pageCount,
          allowOmit,
        )
      : {
          pages: new Map<number, SwapGlanceSection[]>(),
          omitted: seeking.length && seekingStart > pageCount ? seeking : [],
          ok: seeking.length === 0 || seekingStart > pageCount ? seeking.length === 0 : true,
        };

  if (!seekingPack) return null;

  // Determine actual used page indices
  let maxPage = 0;
  for (const p of formalPack.pages.keys()) maxPage = Math.max(maxPage, p);
  for (const p of seekingPack.pages.keys()) maxPage = Math.max(maxPage, p);
  if (maxPage === 0 && (formal.length || seeking.length)) {
    // allowOmit dumped onto pages — check maps
    if (!formalPack.pages.size && !seekingPack.pages.size) return null;
  }
  const usedPages = Math.max(maxPage, formal.length || seeking.length ? 1 : 0);
  if (usedPages > pageCount) return null;

  // If we requested pageCount but used fewer, that's fine — caller prefers smaller.
  const effectiveCount = Math.max(usedPages, 1);
  // Rebuild with correct page titles using effectiveCount only when fits;
  // when trying a specific pageCount budget, titles use that pageCount if we fill it,
  // else the actual used count.
  const titlePageCount = effectiveCount;

  const attempts: LayoutAttempt[] = [];
  let omittedCards =
    formalPack.omitted.reduce((n, s) => n + sectionFaceCount(s), 0) +
    seekingPack.omitted.reduce((n, s) => n + sectionFaceCount(s), 0);

  for (let p = 1; p <= titlePageCount; p++) {
    const formalSecs = formalPack.pages.get(p) || [];
    const seekingSecs = seekingPack.pages.get(p) || [];
    const isLast = p === titlePageCount;
    const reserveOverflow = allowOmit && isLast && omittedCards > 0;

    // Prefer not mixing: if both present on same page (shouldn't with purity),
    // render formal then seeking as consecutive masonry by concatenating.
    // When mixed, use formal mode for formal block — but tryMasonry is one list.
    // With purity, at most one category per page.
    let attempt: LayoutAttempt | null = null;
    if (formalSecs.length && seekingSecs.length) {
      // Mixed page (rare): pack formal with formalMode; if seeking doesn't fit, omit.
      const formalAttempt = bestMasonryForSections(
        formalSecs,
        formalMode,
        false,
        p,
        titlePageCount,
        false,
      );
      if (!formalAttempt?.fits && !allowOmit) return null;
      // For mixed, fall back to concatenating with lookingFor/formal mode for all
      // as stacked/grid of singles after convert — use grid for safety.
      attempt = bestMasonryForSections(
        [...formalSecs, ...seekingSecs],
        formalMode === 'stacked' && seekingMode === 'stacked' ? 'stacked' : 'grid',
        allowOmit && isLast,
        p,
        titlePageCount,
        reserveOverflow,
      );
    } else if (formalSecs.length) {
      attempt = bestMasonryForSections(
        formalSecs,
        formalMode,
        allowOmit && isLast,
        p,
        titlePageCount,
        reserveOverflow || (allowOmit && isLast),
      );
    } else if (seekingSecs.length) {
      attempt = bestMasonryForSections(
        seekingSecs,
        seekingMode,
        allowOmit && isLast,
        p,
        titlePageCount,
        reserveOverflow || (allowOmit && isLast),
      );
    } else {
      attempt = {
        labels: titleLabels(p, titlePageCount),
        placements: [],
        connectors: [],
        fits: true,
        omittedCards: 0,
      };
    }

    if (!attempt) return null;
    if (!attempt.fits && !(allowOmit && isLast)) return null;
    omittedCards += attempt.omittedCards;
    attempts.push(attempt);
  }

  // Attach global +X on last page if needed
  if (allowOmit && omittedCards > 0 && attempts.length) {
    const last = attempts[attempts.length - 1]!;
    const contentBottom =
      SWAP_GLANCE_CANVAS_HEIGHT - SWAP_GLANCE_WATERMARK_HEIGHT - CONTENT_MARGIN_Y;
    const already = last.labels.some((l) => l.role === 'more' && /\+\d+ cards/.test(l.text));
    if (!already) {
      last.labels.push({
        text: `+${omittedCards} cards`,
        x: CONTENT_MARGIN_X,
        y: Math.round(contentBottom - SECTION_OVERFLOW_LABEL_H),
        role: 'more',
      });
    }
  }

  const fits =
    formalPack.ok &&
    seekingPack.ok &&
    omittedCards === 0 &&
    attempts.every((a) => a.fits);

  return { attempts, usedPages: titlePageCount, omittedCards, fits };
}

function toPlan(
  includeSet: SwapGlanceIncludeSet,
  attempt: LayoutAttempt,
  pageIndex: number,
  pageCount: number,
  densifyStage: SwapGlanceDensifyStage,
): SwapGlanceLayoutPlan {
  return {
    layoutVersion: SWAP_GLANCE_GENERATION_VERSION,
    canvasWidth: SWAP_GLANCE_CANVAS_WIDTH,
    canvasHeight: SWAP_GLANCE_CANVAS_HEIGHT,
    filterSetCodes: includeSet.filterSetCodes || [],
    labels: attempt.labels,
    placements: attempt.placements,
    connectors: attempt.connectors,
    fingerprint: swapGlanceFingerprint(includeSet, SWAP_GLANCE_GENERATION_VERSION, {
      pageIndex,
      pageCount,
      densifyStage,
    }),
    pageIndex,
    pageCount,
    densifyStage,
  };
}

/**
 * Build 1–5 layout plans at fixed M card size with densify ladder + category grouping.
 */
export function buildSwapGlanceLayoutPlans(
  includeSet: SwapGlanceIncludeSet,
): SwapGlanceLayoutResult {
  const ladder = densifyLadderFor(includeSet);

  for (const densify of ladder) {
    for (let pageCount = 1; pageCount <= SWAP_GLANCE_MAX_PAGES; pageCount++) {
      const built = buildPagesForDensify(includeSet, densify, pageCount, false);
      if (built?.fits) {
        // Prefer actual used page count — rebuild titles if we over-allocated.
        const used = built.usedPages;
        if (used < pageCount) {
          // Re-run at exact used count for correct titles.
          const exact = buildPagesForDensify(includeSet, densify, used, false);
          if (exact?.fits) {
            return {
              plans: exact.attempts.map((a, i) =>
                toPlan(includeSet, a, i + 1, exact.usedPages, densify.stage),
              ),
              densifyStage: densify.stage,
              omittedCardCount: 0,
              pageCount: exact.usedPages,
            };
          }
        }
        return {
          plans: built.attempts.map((a, i) =>
            toPlan(includeSet, a, i + 1, built.usedPages, densify.stage),
          ),
          densifyStage: densify.stage,
          omittedCardCount: 0,
          pageCount: built.usedPages,
        };
      }
    }
  }

  // Truncate at max densify + 5 pages.
  const lastDensify = ladder[ladder.length - 1] ?? DENSIFY_LADDER[DENSIFY_LADDER.length - 1]!;
  const truncateDensify: DensifyConfig = {
    ...lastDensify,
    stage: 'truncated',
  };
  const truncated = buildPagesForDensify(
    includeSet,
    truncateDensify,
    SWAP_GLANCE_MAX_PAGES,
    true,
  );
  if (truncated) {
    return {
      plans: truncated.attempts.map((a, i) =>
        toPlan(includeSet, a, i + 1, truncated.usedPages, 'truncate'),
      ),
      densifyStage: 'truncate',
      omittedCardCount: truncated.omittedCards,
      pageCount: truncated.usedPages,
    };
  }

  // Absolute empty fallback
  const emptyAttempt: LayoutAttempt = {
    labels: titleLabels(1, 1),
    placements: [],
    connectors: [],
    fits: false,
    omittedCards: includeSet.sections.reduce((n, s) => n + sectionFaceCount(s), 0),
  };
  return {
    plans: [toPlan(includeSet, emptyAttempt, 1, 1, 'truncate')],
    densifyStage: 'truncate',
    omittedCardCount: emptyAttempt.omittedCards,
    pageCount: 1,
  };
}

/**
 * Build a single 1920×1080 layout plan (first page of the multi-page planner).
 * Prefer {@link buildSwapGlanceLayoutPlans} when multi-image output is needed.
 */
export function buildSwapGlanceLayoutPlan(
  includeSet: SwapGlanceIncludeSet,
): SwapGlanceLayoutPlan {
  const result = buildSwapGlanceLayoutPlans(includeSet);
  return result.plans[0]!;
}

export {
  SECTION_HEADER_HEIGHT,
  PAIR_INNER_GAP,
  PAIR_GROUP_GAP,
  SWAP_GLANCE_CARD_HEIGHT,
  cardHeightForWidth,
};
