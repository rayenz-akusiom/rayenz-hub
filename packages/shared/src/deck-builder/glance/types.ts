export const GLANCE_LAYOUT_VERSION = 'glance-layout-2';

export const GLANCE_CANVAS_WIDTH = 1920;
export const GLANCE_CANVAS_HEIGHT = 1080;

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

export type GlanceLayoutPlan = {
  layoutVersion: string;
  canvasWidth: number;
  canvasHeight: number;
  deckName: string | null;
  placements: GlanceCardPlacement[];
  fingerprint: string;
};

export type GlanceIncludeSetResult =
  | { ok: true; includeSet: GlanceIncludeSet }
  | { ok: false; code: 'GLANCE_NOT_ELIGIBLE'; message: string };
