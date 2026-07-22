export type HubPath =
  | '/dailies'
  | '/neopets-more'
  | '/deck-builder'
  | '/commander-builder'
  | '/cube-builder'
  | '/deck-suggest'
  | '/deck-review'
  | '/order-reconcile'
  | '/swap-queue'
  | '/wishlist'
  | '/settings'
  | '/settings/dailies'
  | '/settings/deck-builder'
  | '/settings/deck-suggest'
  | '/settings/order-reconcile';

export const DEFAULT_PATH: HubPath = '/dailies';

/** Hub user segment in deck deep links (`#/{builder}/{user}/{deck}`). */
export const HUB_USER_SLUG = 'default';

export type DeckBuilderRoute = {
  userSlug: string;
  deckSlug: string;
};

export type BuilderFormat = 'commander' | 'cube';

export type SwapQueueBrowseMode = 'default' | 'unified';

export type SwapQueueLayoutMode = 'tiles' | 'stacked' | 'grid';

/** @deprecated Use SwapQueueLayoutMode — kept for older imports during rename. */
export type SwapQueueViewMode = 'queue_tiles' | 'queued_in';

export function defaultBrowseForSwapQueuePath(
  _path: string | null | undefined,
): SwapQueueBrowseMode {
  return 'default';
}

export function defaultLayoutForSwapQueuePath(
  path: string | null | undefined,
): SwapQueueLayoutMode {
  if (path === '/wishlist' || path === 'wishlist') return 'grid';
  return 'tiles';
}

/** @deprecated Use defaultLayoutForSwapQueuePath. */
export function defaultViewForSwapQueuePath(
  path: string | null | undefined,
): SwapQueueViewMode {
  return defaultLayoutForSwapQueuePath(path) === 'tiles' ? 'queue_tiles' : 'queued_in';
}

const BUILDER_PREFIX: Record<BuilderFormat, '/commander-builder' | '/cube-builder'> = {
  commander: '/commander-builder',
  cube: '/cube-builder',
};

const ALL_BUILDER_PREFIXES = [
  '/commander-builder',
  '/cube-builder',
  '/deck-builder',
] as const;

export const KNOWN_PATHS = new Set<string>([
  '/dailies',
  '/neopets-more',
  '/deck-builder',
  '/commander-builder',
  '/cube-builder',
  '/deck-suggest',
  '/deck-review',
  '/order-reconcile',
  '/swap-queue',
  '/wishlist',
  '/settings',
  '/settings/dailies',
  '/settings/deck-builder',
  '/settings/deck-suggest',
  '/settings/order-reconcile',
]);

/** All hub routes are React-owned. */
export const LEGACY_PATHS = new Set<string>();

/** Old static `/apps/<name>/` paths (pre-SPA) → hash routes. */
const LEGACY_APPS_SEGMENT_TO_HASH: Record<string, string> = {
  dailies: '#/dailies',
  'neopets-more': '#/neopets-more',
  'deck-builder': '#/commander-builder',
  'deck-suggest': '#/deck-suggest',
  'deck-review': '#/deck-review',
  'order-reconcile': '#/order-reconcile',
  'swap-queue': '#/swap-queue',
  wishlist: '#/wishlist',
  settings: '#/settings/dailies',
};

/**
 * If the pathname is a legacy `/apps/<name>/` URL (e.g. GitHub Pages 404 fallback),
 * replace the location with the site root + matching hash route.
 * @returns true when a redirect was triggered
 */
export function redirectLegacyAppsPath(
  loc: Pick<Location, 'pathname' | 'search' | 'replace'> = window.location,
): boolean {
  const match = loc.pathname.match(/\/apps\/([^/]+)\/?$/);
  if (!match) return false;
  const hash = LEGACY_APPS_SEGMENT_TO_HASH[match[1]];
  if (!hash) return false;
  const root = loc.pathname.replace(/\/apps\/[^/]+\/?$/, '/');
  loc.replace(`${root}${loc.search || ''}${hash}`);
  return true;
}

export function normalizeHash(hash: string | null | undefined): string {
  if (!hash || hash === '#') {
    return `#${DEFAULT_PATH}`;
  }
  let path = hash.replace(/^#/, '').split('?')[0];
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  return `#${path}`;
}

export function pathFromHash(hash?: string | null): HubPath {
  const normalized = normalizeHash(hash ?? window.location.hash);
  const path = normalized.slice(1);
  // Draft path → Swap Queue
  if (path === '/swap-wants') {
    return '/swap-queue';
  }
  if (KNOWN_PATHS.has(path)) {
    return path as HubPath;
  }
  if (path === '/commander-builder' || path.startsWith('/commander-builder/')) {
    return '/commander-builder';
  }
  if (path === '/cube-builder' || path.startsWith('/cube-builder/')) {
    return '/cube-builder';
  }
  if (path === '/deck-builder' || path.startsWith('/deck-builder/')) {
    return '/deck-builder';
  }
  if (path === '/settings' || path.startsWith('/settings/')) {
    return '/settings/dailies';
  }
  return DEFAULT_PATH;
}

export function builderBasePath(format: BuilderFormat): '/commander-builder' | '/cube-builder' {
  return BUILDER_PREFIX[format];
}

function parseBuilderRouteFromPrefix(path: string, prefix: string): DeckBuilderRoute | null {
  if (path === prefix) return null;
  if (!path.startsWith(`${prefix}/`)) return null;
  const rest = path.slice(prefix.length + 1);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const [userSlug, deckSlug] = parts;
  if (!userSlug || !deckSlug) return null;
  return { userSlug, deckSlug };
}

/**
 * Parse `#/{builder}/:user/:deck` deep links for commander, cube, or legacy deck-builder.
 * Returns null for library routes or malformed nested paths.
 */
export function parseBuilderRoute(
  hash?: string | null,
  format?: BuilderFormat,
): DeckBuilderRoute | null {
  const normalized = normalizeHash(
    hash ?? (typeof window !== 'undefined' ? window.location.hash : ''),
  );
  const path = normalized.slice(1);

  if (format) {
    return parseBuilderRouteFromPrefix(path, builderBasePath(format));
  }

  for (const prefix of ALL_BUILDER_PREFIXES) {
    const route = parseBuilderRouteFromPrefix(path, prefix);
    if (route) return route;
  }
  return null;
}

/** Build `#/{builder}` or `#/{builder}/:user/:deck`. */
export function builderHash(
  format: BuilderFormat,
  userSlug?: string | null,
  deckSlug?: string | null,
): string {
  const base = builderBasePath(format);
  if (userSlug && deckSlug) {
    return `#${base}/${userSlug}/${deckSlug}`;
  }
  return `#${base}`;
}

/** Map legacy `#/deck-builder` hashes to the split builder routes. */
export function resolveLegacyDeckBuilderHash(
  hash: string,
  lookupFormat: (deckSlug: string) => BuilderFormat | null | undefined,
): string {
  const route = parseBuilderRoute(hash);
  if (!route) {
    return builderHash('commander');
  }
  const fmt = lookupFormat(route.deckSlug);
  if (fmt === 'cube') {
    return builderHash('cube', route.userSlug, route.deckSlug);
  }
  return builderHash('commander', route.userSlug, route.deckSlug);
}

/**
 * Parse `#/deck-builder/:user/:deck` and split-builder deep links (deprecated wrapper).
 * @deprecated Use parseBuilderRoute instead.
 */
export function parseDeckBuilderRoute(hash?: string | null): DeckBuilderRoute | null {
  return parseBuilderRoute(hash);
}

/** @deprecated Use builderHash('commander', ...) instead. */
export function deckBuilderHash(userSlug?: string | null, deckSlug?: string | null): string {
  return builderHash('commander', userSlug, deckSlug);
}

export function isSettingsPath(path: string): boolean {
  return path === '/settings' || path.startsWith('/settings/');
}

export function isLegacyPath(path: string): boolean {
  return LEGACY_PATHS.has(path);
}
