import { isGlanceLandSectionName } from './include-set.js';
import { glanceFingerprint } from './fingerprint.js';
import type {
  GlanceBackdrop,
  GlanceCard,
  GlanceCardPlacement,
  GlanceIncludeSet,
  GlanceLabel,
  GlanceLayoutPlan,
  GlanceRegion,
  GlanceSection,
} from './types.js';
import {
  GLANCE_CANVAS_HEIGHT,
  GLANCE_CANVAS_WIDTH,
  GLANCE_CARD_HEIGHT,
  GLANCE_GENERATION_VERSION,
  GLANCE_ROLE_HIGHLIGHT_LIMIT,
} from './types.js';

import { GLANCE_SKY_BLUE } from './chrome-theme.js';

const BACKGROUND = GLANCE_SKY_BLUE;
/** Title strip height (matches footer treatment, taller for large type). */
const HEADER_HEIGHT = 72;
const WATERMARK_HEIGHT = 48;
/** Room for centered frosted section band + text. */
const LABEL_HEIGHT = 32;
const COL_GAP = 8;
const ROLE_GAP = 12;
const PLATE_PAD = 12;
const SECTION_GAP = 10;
const CARD_ASPECT = 61 / 85;
const MIN_CARD_HEIGHT = 48;
/** Minimum vertical peek so card names stay readable. */
const MIN_VISIBLE_Y = 22;
/**
 * Fixed fraction of a card revealed for each stacked card below the top one.
 * Constant per render so every stack uses the same overlap that keeps the card
 * name/title strip visible (blank space below short stacks is expected).
 */
const TITLE_PEEK_RATIO = 0.14;
/** Breathing room between the packed content and the header/footer bars. */
const CONTENT_MARGIN_Y = 18;
const ORIGIN_X = 24;
const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

/** Column-count bias at a fixed card size (densify before shrink). */
type ColumnBias = 'max' | 'min';

type GridColumn = {
  x: number;
  /** Content top of this column (role bottom for short/under-role cols). */
  top: number;
  bottom: number;
  /** True when this column sits under the role block (shorter). */
  underRole: boolean;
};

type Slot = {
  x: number;
  cardTop: number;
  bandHeight: number;
  maxRows: number;
};

type PackedSection = {
  section: GlanceSection;
  slots: Slot[];
  placements: GlanceCardPlacement[];
  colStart: number;
  colCount: number;
  startY: number;
};

function showQuantityFor(card: GlanceCard): boolean {
  return card.quantity > 1;
}

/** Vertical peek per stacked card, fixed for a given card height. */
function peekFor(cardHeight: number): number {
  return Math.max(MIN_VISIBLE_Y, Math.round(cardHeight * TITLE_PEEK_RATIO));
}

/** Cards that fit in a band at the fixed peek pitch. */
function maxRowsFixed(bandHeight: number, cardHeight: number): number {
  if (bandHeight < cardHeight) return 0;
  return 1 + Math.floor((bandHeight - cardHeight) / peekFor(cardHeight));
}

/**
 * Split `count` items into contiguous chunks across the given slots, sized in
 * proportion to each slot's capacity so every column fills to a similar ratio.
 * Returns null if the slots cannot hold everything.
 */
function chunkByCapacity(count: number, slots: Slot[]): number[] | null {
  if (count <= 0) return slots.map(() => 0);
  if (!slots.length) return null;
  const caps = slots.map((s) => Math.max(0, s.maxRows));
  const totalCap = caps.reduce((a, b) => a + b, 0);
  if (totalCap < count) return null;

  const raw = caps.map((c) => (count * c) / totalCap);
  const counts = raw.map((v) => Math.floor(v));
  let assigned = counts.reduce((a, b) => a + b, 0);
  const frac = raw.map((v, i) => ({ i, f: v - Math.floor(v) }));
  frac.sort((a, b) => b.f - a.f);
  let fi = 0;
  while (assigned < count) {
    let placed = false;
    for (let step = 0; step < counts.length; step++) {
      const idx = frac[(fi + step) % frac.length]!.i;
      if (counts[idx]! < caps[idx]!) {
        counts[idx]! += 1;
        assigned += 1;
        fi = (fi + step + 1) % frac.length;
        placed = true;
        break;
      }
    }
    if (!placed) return null;
  }
  return counts;
}

function assignChunks(
  cards: GlanceCard[],
  region: GlanceRegion,
  slots: Slot[],
  cardWidth: number,
  cardHeight: number,
  baseZ: number,
): GlanceCardPlacement[] | null {
  if (!cards.length) return [];
  const counts = chunkByCapacity(cards.length, slots);
  if (!counts) return null;
  const peek = peekFor(cardHeight);
  const placements: GlanceCardPlacement[] = [];
  let idx = 0;
  for (let c = 0; c < slots.length; c++) {
    const slot = slots[c]!;
    const take = counts[c]!;
    const col = cards.slice(idx, idx + take);
    idx += take;
    col.forEach((card, row) => {
      placements.push({
        card,
        region,
        x: Math.round(slot.x),
        y: Math.round(slot.cardTop + row * peek),
        width: cardWidth,
        height: cardHeight,
        zIndex: baseZ + c * 1000 + row,
        showQuantity: showQuantityFor(card),
      });
    });
  }
  return placements;
}

function resolveSections(includeSet: GlanceIncludeSet): GlanceSection[] {
  if (includeSet.sections?.length) {
    return includeSet.sections.filter((s) => s.cards.length > 0);
  }
  // Back-compat for hand-built include sets that only set nonLands/lands.
  const sections: GlanceSection[] = [];
  if (includeSet.nonLands.length) sections.push({ name: 'Main deck', cards: includeSet.nonLands });
  if (includeSet.lands.length) sections.push({ name: 'Lands', cards: includeSet.lands });
  return sections;
}

function regionForSection(section: GlanceSection, mode: GlanceIncludeSet['mode']): GlanceRegion {
  if (mode === 'primary_category') return 'category';
  return isGlanceLandSectionName(section.name) ? 'land' : 'nonland';
}

export function buildTitlePips(commanders: GlanceCard[]): string[] {
  const set = new Set<string>();
  for (const cmd of commanders) {
    for (const c of cmd.colourIdentity || []) {
      const letter = String(c).toUpperCase();
      if ((WUBRG as readonly string[]).includes(letter)) set.add(letter);
    }
  }
  const ordered = WUBRG.filter((c) => set.has(c));
  return ordered.length ? [...ordered] : ['C'];
}

function roleLabel(kind: 'commander' | 'lieutenant', count: number): string {
  if (kind === 'commander') return count === 1 ? 'Commander' : 'Commanders';
  return count === 1 ? 'Lieutenant' : 'Lieutenants';
}

function placeRoleRow(
  cards: GlanceCard[],
  region: 'commander' | 'lieutenant',
  originX: number,
  originY: number,
  cardWidth: number,
  cardHeight: number,
  baseZ: number,
): GlanceCardPlacement[] {
  return cards.map((card, index) => ({
    card,
    region,
    x: Math.round(originX + index * (cardWidth + ROLE_GAP)),
    y: Math.round(originY),
    width: cardWidth,
    height: cardHeight,
    zIndex: baseZ + index,
    showQuantity: showQuantityFor(card),
  }));
}

/**
 * L-shaped columns: short cols under the role plate (left grid, midpoint
 * cutout), tall cols on a fresh grid starting at roleBlockRight + COL_GAP so
 * the first deck column does not kiss the plate.
 */
function buildLShapedColumns(
  contentLeft: number,
  contentRight: number,
  contentTop: number,
  contentBottom: number,
  roleBlockRight: number,
  roleBlockBottom: number,
  hasRoles: boolean,
  colStride: number,
): GridColumn[] {
  const cols: GridColumn[] = [];
  let underCount = 0;
  if (hasRoles) {
    for (let i = 0; ; i++) {
      const x = contentLeft + i * colStride;
      // Midpoint: plate padding may clip a few px into the next column.
      if (x + colStride / 2 < roleBlockRight) underCount++;
      else break;
    }
  }
  for (let i = 0; i < underCount; i++) {
    cols.push({
      x: contentLeft + i * colStride,
      top: roleBlockBottom + SECTION_GAP,
      bottom: contentBottom,
      underRole: true,
    });
  }
  const tallLeft = hasRoles ? roleBlockRight + COL_GAP : contentLeft;
  const tallWidth = Math.max(0, contentRight - tallLeft);
  const tallCount = Math.max(0, Math.floor((tallWidth + COL_GAP) / colStride));
  for (let j = 0; j < tallCount; j++) {
    cols.push({
      x: tallLeft + j * colStride,
      top: contentTop,
      bottom: contentBottom,
      underRole: false,
    });
  }
  return cols;
}

function runCapacity(slots: Slot[]): number {
  return slots.reduce((sum, s) => sum + Math.max(0, s.maxRows), 0);
}

/**
 * Slots for a contiguous column run starting at a shared `startY` (label band
 * then cards). Each column keeps its own bottom (L-shaped tops already baked
 * into cursors via different starting tops).
 */
function slotsAtY(
  columns: GridColumn[],
  start: number,
  count: number,
  startY: number,
  cardHeight: number,
): Slot[] | null {
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const col = columns[start + i];
    if (!col) return null;
    if (startY < col.top - 0.5) return null;
    const cardTop = startY + LABEL_HEIGHT;
    const bandHeight = Math.max(0, col.bottom - cardTop);
    slots.push({
      x: col.x,
      cardTop,
      bandHeight,
      maxRows: maxRowsFixed(bandHeight, cardHeight),
    });
  }
  return slots;
}

/**
 * Vertical masonry: each column has a y-cursor. Sections claim a contiguous
 * run of columns at `max(cursors)` for that run, then advance those cursors
 * so the next section can pack into leftover vertical space (not a single
 * exclusive full-height strip across the top).
 *
 * `max` bias: prefer more columns (shorter stacks) when capacity allows.
 * `min` bias: prefer fewer columns (denser) to leave room / fit later sections.
 */
function packSectionsMasonry(
  sections: GlanceSection[],
  columns: GridColumn[],
  mode: GlanceIncludeSet['mode'],
  cardWidth: number,
  cardHeight: number,
  bias: ColumnBias,
): PackedSection[] | null {
  if (!sections.length) return [];
  if (!columns.length) return null;

  const cursors = columns.map((c) => c.top);
  const packed: PackedSection[] = [];
  const peek = peekFor(cardHeight);
  const maxK = columns.length;

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si]!;
    const n = section.cards.length;

    type Candidate = {
      start: number;
      count: number;
      startY: number;
      slots: Slot[];
    };

    // Collect fits at the highest band (lowest startY), then pick by bias.
    let topY = Number.POSITIVE_INFINITY;
    const atTop: Candidate[] = [];
    for (let k = 1; k <= maxK; k++) {
      for (let start = 0; start + k <= columns.length; start++) {
        const startY = Math.max(...cursors.slice(start, start + k));
        const slots = slotsAtY(columns, start, k, startY, cardHeight);
        if (!slots || runCapacity(slots) < n) continue;
        if (startY < topY - 0.5) {
          topY = startY;
          atTop.length = 0;
          atTop.push({ start, count: k, startY, slots });
        } else if (Math.abs(startY - topY) <= 0.5) {
          atTop.push({ start, count: k, startY, slots });
        }
      }
    }
    if (!atTop.length) return null;
    if (bias === 'max') {
      atTop.sort((a, b) => b.count - a.count || a.start - b.start);
    } else {
      atTop.sort((a, b) => a.count - b.count || a.start - b.start);
    }
    const best = atTop[0]!;

    const { start, count, startY, slots } = best;
    const placements = assignChunks(
      section.cards,
      regionForSection(section, mode),
      slots,
      cardWidth,
      cardHeight,
      100 + si * 100,
    );
    if (!placements) return null;

    // Advance cursors past this section's used stack height in each column.
    const counts = chunkByCapacity(n, slots);
    if (!counts) return null;
    for (let i = 0; i < count; i++) {
      const rows = counts[i]!;
      const slot = slots[i]!;
      const stackBottom =
        rows <= 0
          ? startY + LABEL_HEIGHT
          : slot.cardTop + (rows - 1) * peek + cardHeight;
      cursors[start + i] = Math.max(cursors[start + i]!, stackBottom + SECTION_GAP);
    }

    packed.push({
      section,
      slots,
      placements,
      colStart: start,
      colCount: count,
      startY,
    });
  }

  return packed;
}

type RoleChrome = {
  labels: GlanceLabel[];
  backdrops: GlanceBackdrop[];
  placements: GlanceCardPlacement[];
  roleBlockRight: number;
  roleBlockBottom: number;
  hasRoles: boolean;
};

function placeRoles(
  commanders: GlanceCard[],
  lieutenants: GlanceCard[],
  contentLeft: number,
  contentTop: number,
  cardWidth: number,
  cardHeight: number,
): RoleChrome {
  const labels: GlanceLabel[] = [];
  const backdrops: GlanceBackdrop[] = [];
  const placements: GlanceCardPlacement[] = [];
  let roleBlockRight = contentLeft;
  let roleBlockBottom = contentTop;
  let roleY = contentTop;

  if (commanders.length) {
    const plateInnerW =
      PLATE_PAD * 2 + commanders.length * cardWidth + (commanders.length - 1) * ROLE_GAP;
    const plateH = PLATE_PAD + LABEL_HEIGHT + cardHeight + PLATE_PAD;
    const plateX = contentLeft;
    const plateY = roleY;
    labels.push({
      text: roleLabel('commander', commanders.length),
      x: plateX + PLATE_PAD,
      y: plateY + PLATE_PAD,
      role: 'role',
    });
    backdrops.push({
      region: 'commander',
      x: plateX,
      y: plateY,
      width: plateInnerW,
      height: plateH,
      radius: Math.max(8, Math.round(cardWidth * 0.06)),
    });
    placements.push(
      ...placeRoleRow(
        commanders,
        'commander',
        plateX + PLATE_PAD,
        plateY + PLATE_PAD + LABEL_HEIGHT,
        cardWidth,
        cardHeight,
        10,
      ),
    );
    roleBlockRight = Math.max(roleBlockRight, plateX + plateInnerW);
    roleBlockBottom = Math.max(roleBlockBottom, plateY + plateH);
    roleY = plateY + plateH + SECTION_GAP;
  }

  if (lieutenants.length) {
    const plateInnerW =
      PLATE_PAD * 2 + lieutenants.length * cardWidth + (lieutenants.length - 1) * ROLE_GAP;
    const plateH = PLATE_PAD + LABEL_HEIGHT + cardHeight + PLATE_PAD;
    const plateX = contentLeft;
    const plateY = roleY;
    labels.push({
      text: roleLabel('lieutenant', lieutenants.length),
      x: plateX + PLATE_PAD,
      y: plateY + PLATE_PAD,
      role: 'role',
    });
    backdrops.push({
      region: 'lieutenant',
      x: plateX,
      y: plateY,
      width: plateInnerW,
      height: plateH,
      radius: Math.max(8, Math.round(cardWidth * 0.06)),
    });
    placements.push(
      ...placeRoleRow(
        lieutenants,
        'lieutenant',
        plateX + PLATE_PAD,
        plateY + PLATE_PAD + LABEL_HEIGHT,
        cardWidth,
        cardHeight,
        30,
      ),
    );
    roleBlockRight = Math.max(roleBlockRight, plateX + plateInnerW);
    roleBlockBottom = Math.max(roleBlockBottom, plateY + plateH);
  }

  return {
    labels,
    backdrops,
    placements,
    roleBlockRight,
    roleBlockBottom,
    hasRoles: commanders.length + lieutenants.length > 0,
  };
}

function tryPackAtSize(
  sections: GlanceSection[],
  commanders: GlanceCard[],
  lieutenants: GlanceCard[],
  mode: GlanceIncludeSet['mode'],
  contentLeft: number,
  contentRight: number,
  contentTop: number,
  contentBottom: number,
  cardHeight: number,
  bias: ColumnBias,
): {
  placements: GlanceCardPlacement[];
  labels: GlanceLabel[];
  backdrops: GlanceBackdrop[];
} | null {
  const cardWidth = Math.round(cardHeight * CARD_ASPECT);
  const colStride = cardWidth + COL_GAP;
  const roles = placeRoles(commanders, lieutenants, contentLeft, contentTop, cardWidth, cardHeight);

  const columns = buildLShapedColumns(
    contentLeft,
    contentRight,
    contentTop,
    contentBottom,
    roles.roleBlockRight,
    roles.roleBlockBottom,
    roles.hasRoles,
    colStride,
  );
  if (!columns.length && sections.length) return null;

  const packed = packSectionsMasonry(sections, columns, mode, cardWidth, cardHeight, bias);
  if (!packed) return null;

  const labels = [...roles.labels];
  const placements = [...roles.placements];
  for (const block of packed) {
    if (!block.placements.length) continue;
    const firstX = block.slots[0]!.x;
    const lastSlot = block.slots[block.slots.length - 1]!;
    const spanWidth = Math.round(lastSlot.x + cardWidth - firstX);
    labels.push({
      text: block.section.name,
      x: Math.round(firstX),
      y: Math.round(block.startY),
      width: Math.max(40, spanWidth),
      role: 'section',
    });
    placements.push(...block.placements);
  }

  const maxBottom = Math.max(...placements.map((p) => p.y + p.height), contentTop);
  if (maxBottom > contentBottom + 1) return null;

  return {
    placements,
    labels,
    backdrops: roles.backdrops,
  };
}

export function buildGlanceLayoutPlan(
  includeSet: GlanceIncludeSet,
  deckName: string | null,
): GlanceLayoutPlan {
  const mode = includeSet.mode || 'type_line';
  const sections = resolveSections(includeSet);
  const titlePips = buildTitlePips(includeSet.commanders);
  const commanders = includeSet.commanders.slice(0, GLANCE_ROLE_HIGHLIGHT_LIMIT);
  const lieutenants = includeSet.lieutenants.slice(0, GLANCE_ROLE_HIGHLIGHT_LIMIT);
  const contentLeft = ORIGIN_X;
  const contentRight = GLANCE_CANVAS_WIDTH - ORIGIN_X;
  const contentTop = HEADER_HEIGHT + CONTENT_MARGIN_Y;
  const contentBottom = GLANCE_CANVAS_HEIGHT - WATERMARK_HEIGHT - CONTENT_MARGIN_Y;

  let best: {
    cardHeight: number;
    placements: GlanceCardPlacement[];
    labels: GlanceLabel[];
    backdrops: GlanceBackdrop[];
  } | null = null;

  // Prefer M; at each size try short-stack (max cols) then denser (min cols) before shrinking.
  const biases: ColumnBias[] = ['max', 'min'];
  outer: for (let cardHeight = GLANCE_CARD_HEIGHT; cardHeight >= MIN_CARD_HEIGHT; cardHeight -= 1) {
    for (const bias of biases) {
      const packed = tryPackAtSize(
        sections,
        commanders,
        lieutenants,
        mode,
        contentLeft,
        contentRight,
        contentTop,
        contentBottom,
        cardHeight,
        bias,
      );
      if (!packed) continue;
      best = { cardHeight, ...packed };
      break outer;
    }
  }

  const fingerprint = glanceFingerprint(includeSet, GLANCE_GENERATION_VERSION);

  return {
    layoutVersion: GLANCE_GENERATION_VERSION,
    canvasWidth: GLANCE_CANVAS_WIDTH,
    canvasHeight: GLANCE_CANVAS_HEIGHT,
    deckName,
    titlePips,
    labels: best?.labels ?? [],
    backdrops: best?.backdrops ?? [],
    placements: best?.placements ?? [],
    fingerprint,
  };
}

export { BACKGROUND, WATERMARK_HEIGHT, MIN_VISIBLE_Y, HEADER_HEIGHT };
