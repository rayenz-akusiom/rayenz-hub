import type { GlanceCard } from '../glance/types.js';
import type { WantSourceKind } from '../../mtg/wants-aggregate.js';
import {
  GLANCE_CANVAS_HEIGHT,
  GLANCE_CANVAS_WIDTH,
  GLANCE_CARD_HEIGHT,
  GLANCE_CARD_WIDTH,
  GLANCE_HEADER_HEIGHT,
  GLANCE_PLATE_BACKGROUND,
  GLANCE_WATERMARK_HEIGHT,
} from '../glance/plate.js';

/** Bump when layout, art tier, or render pipeline changes — invalidates cache. */
export const SWAP_GLANCE_GENERATION_VERSION = 'swap-glance-gen-9';

/** @deprecated Prefer GLANCE_CANVAS_WIDTH from glance/plate. */
export const SWAP_GLANCE_CANVAS_WIDTH = GLANCE_CANVAS_WIDTH;
/** @deprecated Prefer GLANCE_CANVAS_HEIGHT from glance/plate. */
export const SWAP_GLANCE_CANVAS_HEIGHT = GLANCE_CANVAS_HEIGHT;

/** @deprecated Prefer GLANCE_CARD_WIDTH from glance/plate. */
export const SWAP_GLANCE_CARD_WIDTH = GLANCE_CARD_WIDTH;
/** @deprecated Prefer GLANCE_CARD_HEIGHT from glance/plate. */
export const SWAP_GLANCE_CARD_HEIGHT = GLANCE_CARD_HEIGHT;

/** Max PNG pages a swaps glance may span. */
export const SWAP_GLANCE_MAX_PAGES = 5;

/** @deprecated Prefer GLANCE_PLATE_BACKGROUND / GLANCE_SKY_BLUE. */
export const SWAP_GLANCE_BACKGROUND = GLANCE_PLATE_BACKGROUND;
/** @deprecated Prefer GLANCE_HEADER_HEIGHT. */
export const SWAP_GLANCE_TITLE_HEIGHT = GLANCE_HEADER_HEIGHT;
/** @deprecated Prefer GLANCE_WATERMARK_HEIGHT. */
export const SWAP_GLANCE_WATERMARK_HEIGHT = GLANCE_WATERMARK_HEIGHT;

export type SwapGlanceMode = 'full' | 'in_only';

export type SwapGlancePackMode = 'grid' | 'stacked';

/**
 * Progressive densify stages when content cannot fit at M across ≤5 pages.
 * Stages that are no-ops for the request are skipped by the planner.
 */
export type SwapGlanceDensifyStage =
  | 'base'
  | 'seeking_stacked'
  | 'looking_for_stacked'
  | 'swaps_to_looking_for_grid'
  | 'swaps_to_looking_for_stacked'
  | 'truncated';

export type SwapGlanceRequestItem = {
  deckId: string;
  kind: WantSourceKind;
  entryId: string;
};

/** Card face used on the swap glance plate (same shape as deck glance). */
export type SwapGlanceCard = GlanceCard;

export type SwapGlancePairRow = {
  kind: 'pair';
  entryId: string;
  out: SwapGlanceCard | null;
  in: SwapGlanceCard | null;
};

export type SwapGlanceSingleRow = {
  kind: 'single';
  entryId: string;
  sourceKind: 'seeking' | 'queued_in';
  card: SwapGlanceCard;
};

export type SwapGlanceRow = SwapGlancePairRow | SwapGlanceSingleRow;

export type SwapGlanceSection = {
  deckId: string;
  deckName: string;
  /** Text header: deck name plus commander name(s) when present. */
  headerText: string;
  rows: SwapGlanceRow[];
};

export type SwapGlanceIncludeSet = {
  mode: SwapGlanceMode;
  includeSeeking: boolean;
  /** Active Scryfall set-filter codes shown on the footer (uppercase). */
  filterSetCodes: string[];
  sections: SwapGlanceSection[];
};

export type SwapGlanceLabel = {
  text: string;
  x: number;
  y: number;
  /** Larger section headers vs overflow "+N more". */
  role: 'title' | 'section' | 'more';
  /** Clip width for rasterized text (section headers should match column width). */
  maxWidth?: number;
};

export type SwapGlancePlacement = {
  card: SwapGlanceCard;
  x: number;
  y: number;
  width: number;
  height: number;
  showQuantity: boolean;
  /** Proxy badge on Out faces when the Hub card is marked proxy. */
  showProxy: boolean;
  /** Visual pairing hint for full swaps (drawn as adjacent faces). */
  pairRole?: 'out' | 'in' | 'single';
};

/** Out → In connector between paired faces. */
export type SwapGlanceConnector = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SwapGlanceLayoutPlan = {
  layoutVersion: string;
  canvasWidth: number;
  canvasHeight: number;
  /** Uppercase set codes for the left watermark (empty = omit). */
  filterSetCodes: string[];
  labels: SwapGlanceLabel[];
  placements: SwapGlancePlacement[];
  connectors: SwapGlanceConnector[];
  fingerprint: string;
  /** 1-based page index when spanning multiple images. */
  pageIndex?: number;
  /** Total pages in this glance render. */
  pageCount?: number;
  densifyStage?: SwapGlanceDensifyStage;
};

export type SwapGlanceLayoutResult = {
  plans: SwapGlanceLayoutPlan[];
  densifyStage: SwapGlanceDensifyStage;
  omittedCardCount: number;
  pageCount: number;
};

export type BuildSwapGlanceOptions = {
  mode: SwapGlanceMode;
  includeSeeking: boolean;
  /** Active set-filter codes to stamp on the plate footer. */
  filterSetCodes?: string[];
};
