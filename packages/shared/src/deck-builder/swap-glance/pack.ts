import {
  glanceCardHeightForWidth,
  glanceMaxStackedRows,
  glanceTitlePeek,
} from '../glance/plate.js';
import type {
  SwapGlanceConnector,
  SwapGlancePackMode,
  SwapGlancePlacement,
  SwapGlanceRow,
} from './types.js';
import {
  CARD_GAP,
  COL_GAP,
  PAIR_GROUP_GAP,
  PAIR_INNER_GAP,
  facesFromRow,
  unitWidth,
  type PackedUnit,
} from './layout-shared.js';

const peekFor = glanceTitlePeek;
const maxStackedRows = glanceMaxStackedRows;

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
  const cardH = glanceCardHeightForWidth(cardW);
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
  const cardH = glanceCardHeightForWidth(cardW);
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
    const cardH = glanceCardHeightForWidth(cardW);
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

  const cardH = glanceCardHeightForWidth(cardW);
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
  const cardH = glanceCardHeightForWidth(cardW);
  const packed = packRowsStacked(rows, 0, 0, bandWidth, Number.POSITIVE_INFINITY, cardW);
  if (!packed.units.length) return cardH;
  let maxBottom = 0;
  for (const unit of packed.units) {
    maxBottom = Math.max(maxBottom, unit.y + cardH);
  }
  return maxBottom;
}

export function packRows(
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

export function measurePackedHeight(
  rows: SwapGlanceRow[],
  bandWidth: number,
  cardW: number,
  mode: SwapGlancePackMode,
): number {
  return mode === 'stacked'
    ? measurePackedHeightStacked(rows, bandWidth, cardW)
    : measurePackedHeightGrid(rows, bandWidth, cardW);
}

export function placementsFromUnits(
  units: PackedUnit[],
  cardW: number,
): { placements: SwapGlancePlacement[]; connectors: SwapGlanceConnector[] } {
  const cardH = glanceCardHeightForWidth(cardW);
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
