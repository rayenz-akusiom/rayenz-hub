import { glanceFingerprint } from './fingerprint.js';
import type {
  GlanceBackdrop,
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
  GLANCE_GENERATION_VERSION,
  GLANCE_ROLE_HIGHLIGHT_LIMIT,
} from './types.js';

const BACKGROUND = '#b8d4e8';
/** Title strip height (matches footer treatment, taller for large type). */
const HEADER_HEIGHT = 72;
const WATERMARK_HEIGHT = 48;
const LABEL_HEIGHT = 28;
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

type Slot = {
  x: number;
  cardTop: number;
  bandHeight: number;
  maxRows: number;
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
 * proportion to each slot's capacity so every column fills to a similar ratio
 * (fills horizontal space, keeps stacks short and balanced). Returns null if
 * the slots cannot hold everything.
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

export function buildGlanceLayoutPlan(
  includeSet: GlanceIncludeSet,
  deckName: string | null,
): GlanceLayoutPlan {
  const titlePips = buildTitlePips(includeSet.commanders);
  const commanders = includeSet.commanders.slice(0, GLANCE_ROLE_HIGHLIGHT_LIMIT);
  const lieutenants = includeSet.lieutenants.slice(0, GLANCE_ROLE_HIGHLIGHT_LIMIT);
  const contentLeft = ORIGIN_X;
  const contentRight = GLANCE_CANVAS_WIDTH - ORIGIN_X;
  const contentTop = HEADER_HEIGHT + CONTENT_MARGIN_Y;
  const contentBottom = GLANCE_CANVAS_HEIGHT - WATERMARK_HEIGHT - CONTENT_MARGIN_Y;
  const contentHeight = Math.max(0, contentBottom - contentTop);

  let best: {
    cardHeight: number;
    placements: GlanceCardPlacement[];
    labels: GlanceLabel[];
    backdrops: GlanceBackdrop[];
  } | null = null;

  for (let cardHeight = GLANCE_CARD_HEIGHT; cardHeight >= MIN_CARD_HEIGHT; cardHeight -= 1) {
    const cardWidth = Math.round(cardHeight * CARD_ASPECT);
    const colStride = cardWidth + COL_GAP;

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

    const hasRoles = commanders.length + lieutenants.length > 0;
    const besideLeft = hasRoles ? roleBlockRight + COL_GAP : contentLeft;
    const besideWidth = Math.max(0, contentRight - besideLeft);
    const underTop = hasRoles ? roleBlockBottom + SECTION_GAP : contentTop;
    const underHeight = Math.max(0, contentBottom - underTop);
    const underWidth = hasRoles ? Math.max(0, roleBlockRight - contentLeft) : 0;

    // Reserve a label row at the top of each packing zone.
    const besideCardTop = contentTop + LABEL_HEIGHT;
    const besideBandHeight = Math.max(0, contentHeight - LABEL_HEIGHT);
    const underCardTop = underTop + LABEL_HEIGHT;
    const underBandHeight = Math.max(0, underHeight - LABEL_HEIGHT);

    const besideCols = Math.max(0, Math.floor((besideWidth + COL_GAP) / colStride));
    const underCols = Math.max(0, Math.floor((underWidth + COL_GAP) / colStride));
    if (besideCols + underCols <= 0 && (includeSet.nonLands.length || includeSet.lands.length))
      continue;

    const besideSlot = (col: number): Slot => ({
      x: besideLeft + col * colStride,
      cardTop: besideCardTop,
      bandHeight: besideBandHeight,
      maxRows: maxRowsFixed(besideBandHeight, cardHeight),
    });
    const underSlot = (col: number): Slot => ({
      x: contentLeft + col * colStride,
      cardTop: underCardTop,
      bandHeight: underBandHeight,
      maxRows: maxRowsFixed(underBandHeight, cardHeight),
    });

    const nonLandCount = includeSet.nonLands.length;
    const landCount = includeSet.lands.length;

    // Split the tall "beside" columns between main deck and lands in proportion
    // to their card counts; the shorter "under" columns (the void below the role
    // block) are bonus capacity reserved for the main deck so it — not the
    // lands — wraps underneath the commanders.
    let mainBesideCols = besideCols;
    let landBesideCols = 0;
    if (nonLandCount > 0 && landCount > 0 && besideCols >= 2) {
      const weight = nonLandCount / (nonLandCount + landCount);
      mainBesideCols = Math.min(besideCols - 1, Math.max(1, Math.round(besideCols * weight)));
      landBesideCols = besideCols - mainBesideCols;
    } else if (nonLandCount === 0) {
      mainBesideCols = 0;
      landBesideCols = besideCols;
    }

    const mainSlots: Slot[] = [];
    for (let c = 0; c < mainBesideCols; c++) mainSlots.push(besideSlot(c));
    for (let c = 0; c < underCols; c++) mainSlots.push(underSlot(c));
    const landSlots: Slot[] = [];
    for (let c = 0; c < landBesideCols; c++) landSlots.push(besideSlot(mainBesideCols + c));

    if (nonLandCount > 0 && !mainSlots.some((s) => s.maxRows > 0)) continue;
    if (landCount > 0 && !landSlots.some((s) => s.maxRows > 0)) continue;

    const nonLandPlacements = assignChunks(
      includeSet.nonLands,
      'nonland',
      mainSlots,
      cardWidth,
      cardHeight,
      100,
    );
    if (!nonLandPlacements) continue;
    const landPlacements = assignChunks(
      includeSet.lands,
      'land',
      landSlots,
      cardWidth,
      cardHeight,
      200,
    );
    if (!landPlacements) continue;

    const labelSlot = (slots: Slot[], placed: GlanceCardPlacement[]): Slot | null => {
      if (!placed.length) return null;
      const used = slots.filter((_, i) => placed.some((p) => Math.round(slots[i]!.x) === p.x));
      const candidates = used.length ? used : slots;
      return candidates.reduce((a, b) => (b.cardTop < a.cardTop ? b : a));
    };
    if (nonLandCount) {
      const s = labelSlot(mainSlots, nonLandPlacements);
      if (s) labels.push({ text: 'Main deck', x: Math.round(s.x), y: Math.round(s.cardTop - LABEL_HEIGHT) });
    }
    if (landCount) {
      const s = labelSlot(landSlots, landPlacements);
      if (s) labels.push({ text: 'Lands', x: Math.round(s.x), y: Math.round(s.cardTop - LABEL_HEIGHT) });
    }

    placements.push(...nonLandPlacements, ...landPlacements);
    const maxBottom = Math.max(...placements.map((p) => p.y + p.height), contentTop);
    if (maxBottom > contentBottom + 1) continue;

    best = { cardHeight, placements, labels, backdrops };
    break;
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
