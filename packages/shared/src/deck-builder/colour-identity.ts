import type { ThreeColourNamingStyle } from '../schemas/deck-builder-settings.js';
import { DEFAULT_DECK_BUILDER_SETTINGS } from '../schemas/deck-builder-settings.js';
import { isBasicLand } from './quantities.js';

/** Card shape needed for CI bucketing (resolved CardView works). */
export type ColourIdentityCard = {
  name: string;
  typeLine?: string | null;
  colourIdentity?: string[];
};

const WUBRG_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;

const MONO: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

const BASIC_LAND_CI: Record<string, string[]> = {
  plains: ['W'],
  island: ['U'],
  swamp: ['B'],
  mountain: ['R'],
  forest: ['G'],
  wastes: [],
  'snow-covered plains': ['W'],
  'snow-covered island': ['U'],
  'snow-covered swamp': ['B'],
  'snow-covered mountain': ['R'],
  'snow-covered forest': ['G'],
};

const GUILDS: Record<string, string> = {
  WU: 'Azorius',
  UB: 'Dimir',
  BR: 'Rakdos',
  RG: 'Gruul',
  WG: 'Selesnya',
  WB: 'Orzhov',
  UR: 'Izzet',
  BG: 'Golgari',
  WR: 'Boros',
  UG: 'Simic',
};

const SHARDS: Record<string, string> = {
  WUG: 'Bant',
  WUB: 'Esper',
  UBR: 'Grixis',
  BRG: 'Jund',
  WRG: 'Naya',
};

const CAPENNA: Record<string, string> = {
  WUG: 'Brokers',
  WUB: 'Obscura',
  UBR: 'Maestros',
  BRG: 'Riveteers',
  WRG: 'Cabaretti',
};

const WEDGES: Record<string, string> = {
  WBG: 'Abzan',
  WUR: 'Jeskai',
  UBG: 'Sultai',
  WBR: 'Mardu',
  URG: 'Temur',
};

const IKORIA: Record<string, string> = {
  WBG: 'Indatha',
  WUR: 'Raugrin',
  UBG: 'Zagoth',
  WBR: 'Savai',
  URG: 'Ketria',
};

const FOUR_COLOUR: Record<string, string> = {
  UBRG: 'White-less',
  WBRG: 'Blue-less',
  WURG: 'Black-less',
  WUBG: 'Red-less',
  WUBR: 'Green-less',
};

const GUILD_ORDER = [
  'Azorius',
  'Dimir',
  'Rakdos',
  'Gruul',
  'Selesnya',
  'Orzhov',
  'Izzet',
  'Golgari',
  'Boros',
  'Simic',
] as const;

const SHARD_ORDER = ['Bant', 'Esper', 'Grixis', 'Jund', 'Naya'] as const;
const CAPENNA_ORDER = ['Brokers', 'Obscura', 'Maestros', 'Riveteers', 'Cabaretti'] as const;
const WEDGE_ORDER = ['Abzan', 'Jeskai', 'Sultai', 'Mardu', 'Temur'] as const;
const IKORIA_ORDER = ['Indatha', 'Raugrin', 'Zagoth', 'Savai', 'Ketria'] as const;
const FOUR_ORDER = ['White-less', 'Blue-less', 'Black-less', 'Red-less', 'Green-less'] as const;

export type ThreeColourNamingStyleInput = Partial<ThreeColourNamingStyle>;

export type ColourIdentityOptions = {
  style?: ThreeColourNamingStyleInput | null;
  separateLands?: boolean;
};

/** Accepts either naming style fields or `{ style, separateLands }`. */
export type ColourIdentityOptionsInput =
  | ColourIdentityOptions
  | ThreeColourNamingStyleInput
  | null
  | undefined;

export function resolveThreeColourStyle(
  style?: ThreeColourNamingStyleInput | null,
): ThreeColourNamingStyle {
  return {
    allyThreeColourNames:
      style?.allyThreeColourNames ?? DEFAULT_DECK_BUILDER_SETTINGS.allyThreeColourNames,
    enemyThreeColourNames:
      style?.enemyThreeColourNames ?? DEFAULT_DECK_BUILDER_SETTINGS.enemyThreeColourNames,
  };
}

function isOptionsBag(
  options: ColourIdentityOptionsInput,
): options is ColourIdentityOptions {
  return (
    !!options &&
    typeof options === 'object' &&
    ('style' in options || 'separateLands' in options)
  );
}

function resolveColourIdentityOptions(options?: ColourIdentityOptionsInput): {
  style: ThreeColourNamingStyle;
  separateLands: boolean;
} {
  if (isOptionsBag(options)) {
    return {
      style: resolveThreeColourStyle(options.style),
      separateLands: Boolean(options.separateLands),
    };
  }
  return {
    style: resolveThreeColourStyle(options ?? null),
    separateLands: false,
  };
}

function isLandCard(card: ColourIdentityCard): boolean {
  return /\bLand\b/i.test(card.typeLine || '') || isBasicLand(card);
}

export function colourIdentitySectionsFor(
  options?: ColourIdentityOptionsInput,
): readonly string[] {
  const { style, separateLands } = resolveColourIdentityOptions(options);
  const ally = style.allyThreeColourNames === 'capenna' ? CAPENNA_ORDER : SHARD_ORDER;
  const enemy = style.enemyThreeColourNames === 'ikoria' ? IKORIA_ORDER : WEDGE_ORDER;
  const sections = [
    'White',
    'Blue',
    'Black',
    'Red',
    'Green',
    ...GUILD_ORDER,
    ...ally,
    ...enemy,
    ...FOUR_ORDER,
    'Prismatic',
    'Colorless',
  ];
  return separateLands ? [...sections, 'Lands'] : sections;
}

/** Default section list (shards + wedges). Prefer `colourIdentitySectionsFor` when style is known. */
export const COLOUR_IDENTITY_SECTIONS = colourIdentitySectionsFor({
  style: DEFAULT_DECK_BUILDER_SETTINGS,
});

export type ColourIdentitySection = string;

function sortWubrg(colours: string[]): string[] {
  const set = new Set(colours.filter(Boolean));
  return WUBRG_ORDER.filter((c) => set.has(c));
}

function basicLandColours(name: string | null | undefined): string[] | null {
  const key = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, '');
  if (!(key in BASIC_LAND_CI)) return null;
  return BASIC_LAND_CI[key];
}

function resolveColours(card: ColourIdentityCard): string[] {
  const fromCard = sortWubrg([...(card.colourIdentity || [])]);
  if (fromCard.length) return fromCard;
  if (isBasicLand(card)) {
    const fromName = basicLandColours(card.name);
    if (fromName) return sortWubrg(fromName);
  }
  return [];
}

function threeColourLabel(key: string, style: ThreeColourNamingStyle): string | undefined {
  if (key in SHARDS || key in CAPENNA) {
    const map = style.allyThreeColourNames === 'capenna' ? CAPENNA : SHARDS;
    return map[key];
  }
  if (key in WEDGES || key in IKORIA) {
    const map = style.enemyThreeColourNames === 'ikoria' ? IKORIA : WEDGES;
    return map[key];
  }
  return undefined;
}

export function colourIdentitySection(
  card: ColourIdentityCard,
  options?: ColourIdentityOptionsInput,
): string {
  const { style, separateLands } = resolveColourIdentityOptions(options);
  if (separateLands && isLandCard(card)) return 'Lands';
  const colours = resolveColours(card);
  if (colours.length === 0) return 'Colorless';
  if (colours.length === 1) return MONO[colours[0]] || 'Colorless';
  const key = colours.join('');
  if (colours.length === 2) return GUILDS[key] || 'Colorless';
  if (colours.length === 3) return threeColourLabel(key, style) || 'Colorless';
  if (colours.length === 4) return FOUR_COLOUR[key] || 'Colorless';
  if (colours.length === 5) return 'Prismatic';
  return 'Colorless';
}

export function groupByColourIdentity<T extends ColourIdentityCard>(
  cards: T[],
  options?: ColourIdentityOptionsInput,
): Record<string, T[]> {
  const sections = colourIdentitySectionsFor(options);
  const groups = Object.fromEntries(sections.map((s) => [s, [] as T[]])) as Record<string, T[]>;
  for (const card of cards) {
    const section = colourIdentitySection(card, options);
    if (!groups[section]) groups[section] = [];
    groups[section].push(card);
  }
  return groups;
}
