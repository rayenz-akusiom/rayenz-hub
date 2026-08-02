import type { GlanceCard } from '../glance/types.js';
import type { WantSourceKind } from '../../mtg/wants-aggregate.js';

/** Bump when layout, art tier, or render pipeline changes — invalidates cache. */
export const SWAP_GLANCE_GENERATION_VERSION = 'swap-glance-gen-1';

export const SWAP_GLANCE_CANVAS_WIDTH = 1920;
export const SWAP_GLANCE_CANVAS_HEIGHT = 1080;

/** Matches deck-glance M card width. */
export const SWAP_GLANCE_CARD_WIDTH = 213;
/** M height at Scryfall 61∶85 aspect. */
export const SWAP_GLANCE_CARD_HEIGHT = 297;

export type SwapGlanceMode = 'full' | 'in_only';

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
  sections: SwapGlanceSection[];
};

export type SwapGlanceLabel = {
  text: string;
  x: number;
  y: number;
  /** Larger section headers vs overflow "+N more". */
  role: 'title' | 'section' | 'more';
};

export type SwapGlancePlacement = {
  card: SwapGlanceCard;
  x: number;
  y: number;
  width: number;
  height: number;
  showQuantity: boolean;
  /** Visual pairing hint for full swaps (drawn as adjacent faces). */
  pairRole?: 'out' | 'in' | 'single';
};

export type SwapGlanceLayoutPlan = {
  layoutVersion: string;
  canvasWidth: number;
  canvasHeight: number;
  labels: SwapGlanceLabel[];
  placements: SwapGlancePlacement[];
  fingerprint: string;
};

export type BuildSwapGlanceOptions = {
  mode: SwapGlanceMode;
  includeSeeking: boolean;
};
