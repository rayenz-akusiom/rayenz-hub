/** Bump when layout, art tier, render pipeline, or delivery changes — invalidates S3 cache. */
export const GLANCE_GENERATION_VERSION = 'glance-gen-9';

/** Maximum commanders/lieutenants shown on their highlight plates. */
export const GLANCE_ROLE_HIGHLIGHT_LIMIT = 2;

/** @deprecated Use GLANCE_GENERATION_VERSION for cache keys. */
export const GLANCE_LAYOUT_VERSION = GLANCE_GENERATION_VERSION;

export const GLANCE_CANVAS_WIDTH = 1920;
export const GLANCE_CANVAS_HEIGHT = 1080;

/** Matches web `CARD_SIZE_PX.M` (deck-builder card width). */
export const GLANCE_CARD_WIDTH = 213;
/** M height at Scryfall 61∶85 aspect (`round(213 * 85 / 61)`). */
export const GLANCE_CARD_HEIGHT = 297;

export type GlanceRegion = 'commander' | 'lieutenant' | 'nonland' | 'land';

export type GlanceCard = {
  instanceId: string;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  typeLine: string | null;
  colours: string[];
  /** Oracle colour identity (WUBRG letters). */
  colourIdentity: string[];
  primaryCategory: string | null;
  quantity: number;
  imageUrl: string | null;
  isBasicLand: boolean;
  isLand: boolean;
  /** Synthetic empty slot padding underfull decks to 100 faces. */
  isPlaceholder?: boolean;
  /** Unofficial / proxy copy; used by swap glance Out badges. */
  proxy?: boolean;
};

export type GlanceIncludeSet = {
  cards: GlanceCard[];
  quantitySum: number;
  commanders: GlanceCard[];
  lieutenants: GlanceCard[];
  nonLands: GlanceCard[];
  lands: GlanceCard[];
};

export type GlanceCardPlacement = {
  card: GlanceCard;
  region: GlanceRegion;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  showQuantity: boolean;
};

export type GlanceLabel = {
  text: string;
  x: number;
  y: number;
};

export type GlanceBackdrop = {
  region: 'commander' | 'lieutenant';
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

export type GlanceLayoutPlan = {
  layoutVersion: string;
  canvasWidth: number;
  canvasHeight: number;
  deckName: string | null;
  /** WUBRG-ordered commander colour-identity pips for the title bar (`C` if colourless). */
  titlePips: string[];
  labels: GlanceLabel[];
  backdrops: GlanceBackdrop[];
  placements: GlanceCardPlacement[];
  fingerprint: string;
};

export type BuildGlanceIncludeSetOptions = {
  /** Explicit lieutenant highlights; falls back to the deterministic auto-pick. */
  lieutenantInstanceIds?: string[];
};

export type GlanceIncludeSetResult =
  | { ok: true; includeSet: GlanceIncludeSet }
  | {
      ok: false;
      code: 'GLANCE_NOT_ELIGIBLE' | 'GLANCE_INVALID_LIEUTENANTS';
      message: string;
    };
