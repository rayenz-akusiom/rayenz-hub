/** Sky-blue plate used by Cube (future) and as the historical default. */
export const GLANCE_SKY_BLUE = '#b8d4e8';

export const TEXT_INK_DARK = '#111827';
export const TEXT_INK_LIGHT = '#f8fafc';

/** Opaque or translucent strip fill for sharp `create` / SVG. */
export type GlanceChromeBarFill =
  | { kind: 'solid'; hex: string }
  | { kind: 'translucent'; r: number; g: number; b: number; alpha: number };

export type GlanceChromeBackground =
  | { kind: 'solid'; hex: string }
  | {
      kind: 'softBlend';
      /** Left wash (first pip). */
      leftHex: string;
      /** Right wash (second pip). */
      rightHex: string;
    };

export type GlanceChromeTheme = {
  headerFill: GlanceChromeBarFill;
  footerFill: GlanceChromeBarFill;
  headerInk: string;
  footerInk: string;
  background: GlanceChromeBackground;
  /**
   * Frosted category-band fill as CSS colour for SVG.
   * Neutral so labels read on every CI wash.
   */
  sectionBandFill: string;
  sectionBandInk: string;
};

type ColourLetter = 'W' | 'U' | 'B' | 'R' | 'G';

type ColourSwatch = {
  /** Darker shade for header/footer bars. */
  bar: string;
  /** Lighter wash for solid / soft-blend backgrounds. */
  wash: string;
};

/** Tunable CI chrome anchors (cream for W, not pure white). */
const COLOUR_SWATCHES: Record<ColourLetter, ColourSwatch> = {
  W: { bar: '#A89B6E', wash: '#EDE6C8' },
  U: { bar: '#0A4A7A', wash: '#9BC4DC' },
  B: { bar: '#2A2433', wash: '#A8A29E' },
  R: { bar: '#9A1E22', wash: '#E8A890' },
  G: { bar: '#1F5C32', wash: '#B5CFA8' },
};

const SILVER: ColourSwatch = { bar: '#8B939E', wash: '#C5CBD3' };
const GOLD: ColourSwatch = { bar: '#B8860B', wash: '#E8D48B' };

const LEGACY_TRANSLUCENT: GlanceChromeBarFill = {
  kind: 'translucent',
  r: 0,
  g: 0,
  b: 0,
  alpha: 0.35,
};

const WUBRG: readonly ColourLetter[] = ['W', 'U', 'B', 'R', 'G'];

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Relative luminance (sRGB), 0–1. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** Light ink on dark fills, dark ink on light fills. */
export function contrastInk(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? TEXT_INK_DARK : TEXT_INK_LIGHT;
}

function barFillFromHex(hex: string): GlanceChromeBarFill {
  return { kind: 'solid', hex };
}

function normalizePips(titlePips: string[] | null | undefined): string[] {
  const raw = (titlePips || []).map((p) => String(p || '').toUpperCase());
  const colours = WUBRG.filter((c) => raw.includes(c));
  if (colours.length) return [...colours];
  if (raw.includes('C') || raw.length === 0) return ['C'];
  return ['C'];
}

function swatchForPip(pip: string): ColourSwatch {
  if ((WUBRG as readonly string[]).includes(pip)) {
    return COLOUR_SWATCHES[pip as ColourLetter];
  }
  return SILVER;
}

function skyBlueTheme(): GlanceChromeTheme {
  return {
    headerFill: LEGACY_TRANSLUCENT,
    footerFill: LEGACY_TRANSLUCENT,
    headerInk: TEXT_INK_LIGHT,
    footerInk: TEXT_INK_LIGHT,
    background: { kind: 'solid', hex: GLANCE_SKY_BLUE },
    sectionBandFill: 'rgba(255,255,255,0.72)',
    sectionBandInk: TEXT_INK_DARK,
  };
}

export type ResolveGlanceChromeThemeOptions = {
  /** When `cube`, keep historical sky-blue chrome (no CI theming). */
  format?: string | null;
};

/**
 * Resolve deck-glance plate chrome from commander title pips.
 * Swap glances keep sky-blue separately; pass `format: 'cube'` for Cube.
 */
export function resolveGlanceChromeTheme(
  titlePips: string[] | null | undefined,
  options: ResolveGlanceChromeThemeOptions = {},
): GlanceChromeTheme {
  if (String(options.format || '').toLowerCase() === 'cube') {
    return skyBlueTheme();
  }

  const pips = normalizePips(titlePips);

  if (pips.length === 1 && pips[0] === 'C') {
    return {
      headerFill: barFillFromHex(SILVER.bar),
      footerFill: barFillFromHex(SILVER.bar),
      headerInk: contrastInk(SILVER.bar),
      footerInk: contrastInk(SILVER.bar),
      background: { kind: 'solid', hex: SILVER.wash },
      sectionBandFill: 'rgba(255,255,255,0.72)',
      sectionBandInk: TEXT_INK_DARK,
    };
  }

  if (pips.length >= 3) {
    return {
      headerFill: barFillFromHex(GOLD.bar),
      footerFill: barFillFromHex(GOLD.bar),
      headerInk: contrastInk(GOLD.bar),
      footerInk: contrastInk(GOLD.bar),
      background: { kind: 'solid', hex: GOLD.wash },
      sectionBandFill: 'rgba(255,255,255,0.72)',
      sectionBandInk: TEXT_INK_DARK,
    };
  }

  if (pips.length === 2) {
    const left = swatchForPip(pips[0]!);
    const right = swatchForPip(pips[1]!);
    return {
      headerFill: barFillFromHex(left.bar),
      footerFill: barFillFromHex(right.bar),
      headerInk: contrastInk(left.bar),
      footerInk: contrastInk(right.bar),
      background: { kind: 'softBlend', leftHex: left.wash, rightHex: right.wash },
      sectionBandFill: 'rgba(255,255,255,0.72)',
      sectionBandInk: TEXT_INK_DARK,
    };
  }

  // Mono
  const swatch = swatchForPip(pips[0]!);
  return {
    headerFill: barFillFromHex(swatch.bar),
    footerFill: barFillFromHex(swatch.bar),
    headerInk: contrastInk(swatch.bar),
    footerInk: contrastInk(swatch.bar),
    background: { kind: 'solid', hex: swatch.wash },
    sectionBandFill: 'rgba(255,255,255,0.72)',
    sectionBandInk: TEXT_INK_DARK,
  };
}

/** sharp `create` background from a bar fill. */
export function sharpBackgroundFromBarFill(
  fill: GlanceChromeBarFill,
): string | { r: number; g: number; b: number; alpha: number } {
  if (fill.kind === 'solid') return fill.hex;
  return { r: fill.r, g: fill.g, b: fill.b, alpha: fill.alpha };
}
