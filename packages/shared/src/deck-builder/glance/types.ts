/** Bump when layout, art tier, render pipeline, or delivery changes — invalidates S3 cache. */
export const GLANCE_GENERATION_VERSION = 'glance-gen-4';

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
  primaryCategory: string | null;
  quantity: number;
  imageUrl: string | null;
  isBasicLand: boolean;
  isLand: boolean;
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

export type GlanceLayoutPlan = {
  layoutVersion: string;
  canvasWidth: number;
  canvasHeight: number;
  deckName: string | null;
  labels: GlanceLabel[];
  placements: GlanceCardPlacement[];
  fingerprint: string;
};

export type GlanceIncludeSetResult =
  | { ok: true; includeSet: GlanceIncludeSet }
  | { ok: false; code: 'GLANCE_NOT_ELIGIBLE'; message: string };
