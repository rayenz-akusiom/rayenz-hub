import { GLANCE_SKY_BLUE } from './chrome-theme.js';

/** Shared glance plate canvas width (deck + swap). */
export const GLANCE_CANVAS_WIDTH = 1920;
/** Shared glance plate canvas height (deck + swap). */
export const GLANCE_CANVAS_HEIGHT = 1080;

/** Matches web `CARD_SIZE_PX.M` (deck-builder card width). */
export const GLANCE_CARD_WIDTH = 213;
/** M height at Scryfall 61∶85 aspect (`round(213 * 85 / 61)`). */
export const GLANCE_CARD_HEIGHT = 297;

/** Scryfall card aspect (width∶height). */
export const GLANCE_CARD_ASPECT = 61 / 85;

/** Title / header bar height. */
export const GLANCE_HEADER_HEIGHT = 72;
/** Watermark / footer bar height. */
export const GLANCE_WATERMARK_HEIGHT = 48;

/** Default / Cube / swap plate background. */
export const GLANCE_PLATE_BACKGROUND = GLANCE_SKY_BLUE;

/** Minimum vertical peek so card names stay readable. */
export const GLANCE_MIN_VISIBLE_Y = 22;
/**
 * Fixed fraction of a card revealed for each stacked card below the top one.
 * Constant per render so every stack uses the same overlap that keeps the card
 * name/title strip visible (blank space below short stacks is expected).
 */
export const GLANCE_TITLE_PEEK_RATIO = 0.14;

/** Vertical peek per stacked card, fixed for a given card height. */
export function glanceTitlePeek(cardHeight: number): number {
  return Math.max(GLANCE_MIN_VISIBLE_Y, Math.round(cardHeight * GLANCE_TITLE_PEEK_RATIO));
}

/** Cards that fit in a band at the fixed peek pitch. */
export function glanceMaxStackedRows(bandHeight: number, cardHeight: number): number {
  if (bandHeight < cardHeight) return 0;
  return 1 + Math.floor((bandHeight - cardHeight) / glanceTitlePeek(cardHeight));
}

/** Card height for a given width at the shared Scryfall aspect. */
export function glanceCardHeightForWidth(cardW: number): number {
  return Math.round(cardW / GLANCE_CARD_ASPECT);
}

/** Card width for a given height at the shared Scryfall aspect. */
export function glanceCardWidthForHeight(cardH: number): number {
  return Math.round(cardH * GLANCE_CARD_ASPECT);
}
