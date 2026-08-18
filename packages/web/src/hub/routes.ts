import { SANDBOX_USERNAME, usernameToSlug } from '@rayenz-hub/shared';
import { getHubAuthSession } from '../lib/hub-auth-session';

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
  | '/settings/hub-api'
  | '/settings/dailies'
  | '/settings/deck-builder'
  | '/settings/deck-suggest'
  | '/settings/order-reconcile'
  | '/settings/swap-queue'
  | '/settings/invites'
  | '/invite';

export const DEFAULT_PATH: HubPath = '/dailies';

/** Unsigned / sample-deck URL slug. Not a Cognito user. */
export {
  SANDBOX_USERNAME as SANDBOX_USER_SLUG,
  RETIRED_OWNER_SLUG,
  RETIRED_USER_SLUG,
} from '@rayenz-hub/shared';

/** Hub user segment in deck deep links (`#/{builder}/{user}/{deck}`). */
export function hubUserSlug(): string {
  const username = getHubAuthSession()?.username?.trim();
  if (!username) return SANDBOX_USERNAME;
  return usernameToSlug(username) || SANDBOX_USERNAME;
}

/** Local IndexedDB library: signed-in owner slug, or always-local sandbox. */
export function isLocalLibrarySlug(slug: string): boolean {
  return slug === hubUserSlug() || slug === SANDBOX_USERNAME;
}

export type DeckBuilderRoute = {
  userSlug: string;
  deckSlug: string;
};

export type BuilderFormat = 'commander' | 'cube';

export type SwapQueueRoute = {
  userSlug: string;
};

export type SwapQueueEntryPath = 'swap-queue' | 'wishlist';

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
  const raw = String(path || '');
  if (raw === '/wishlist' || raw === 'wishlist' || raw.startsWith('/wishlist/')) return 'grid';
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
  '/settings/hub-api',
  '/settings/dailies',
  '/settings/deck-builder',
  '/settings/deck-suggest',
  '/settings/order-reconcile',
  '/settings/swap-queue',
  '/settings/invites',
]);

/** All hub routes are React-owned. */
export const LEGACY_PATHS = new Set<string>();

/** Old static `/apps/<name>/` paths (pre-SPA) → hash routes. */
const LEGACY_APPS_SEGMENT_TO_HASH: Record<string, string> = {
  dailies: '#/dailies',
  'neopets-more': '#/neopets-more',
  'deck-builder': '#/commander-builder',
  'deck-suggest': '#/deck-suggest',
  'deck-review': '#/deck-suggest',
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
  // Deck Review merged into Deck Suggest
  if (path === '/deck-review') {
    return '/deck-suggest';
  }
  if (path === '/invite' || path.startsWith('/invite/')) {
    return '/invite';
  }
  if (KNOWN_PATHS.has(path)) {
    return path as HubPath;
  }
  if (path.startsWith('/swap-queue/')) {
    return '/swap-queue';
  }
  if (path.startsWith('/wishlist/')) {
    return '/wishlist';
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

const SWAP_QUEUE_PREFIXES = ['/swap-queue', '/wishlist'] as const;

function parseSwapQueueRouteFromPrefix(path: string, prefix: string): SwapQueueRoute | null {
  if (path === prefix) return null;
  if (!path.startsWith(`${prefix}/`)) return null;
  const rest = path.slice(prefix.length + 1);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length !== 1) return null;
  const userSlug = parts[0];
  if (!userSlug) return null;
  return { userSlug };
}

/**
 * Parse `#/swap-queue/:user` and `#/wishlist/:user` share links.
 * Returns null for the owner library route or malformed nested paths.
 */
export function parseSwapQueueRoute(hash?: string | null): SwapQueueRoute | null {
  const normalized = normalizeHash(
    hash ?? (typeof window !== 'undefined' ? window.location.hash : ''),
  );
  const path = normalized.slice(1);
  for (const prefix of SWAP_QUEUE_PREFIXES) {
    const route = parseSwapQueueRouteFromPrefix(path, prefix);
    if (route) return route;
  }
  return null;
}

/** Build `#/swap-queue`, `#/wishlist`, or the username share hash. */
export function swapQueueHash(
  userSlug?: string | null,
  entryPath: SwapQueueEntryPath = 'swap-queue',
): string {
  const base = entryPath === 'wishlist' ? '/wishlist' : '/swap-queue';
  if (userSlug) {
    return `#${base}/${userSlug}`;
  }
  return `#${base}`;
}

/** Absolute share URL for a username (always `#/swap-queue/{slug}`). */
export function swapQueueShareUrl(
  userSlug: string,
  loc: Pick<Location, 'origin' | 'pathname'> = window.location,
): string {
  return `${loc.origin}${loc.pathname}${swapQueueHash(userSlug)}`;
}

export function isSettingsPath(path: string): boolean {
  return path === '/settings' || path.startsWith('/settings/');
}

export function isLegacyPath(path: string): boolean {
  return LEGACY_PATHS.has(path);
}
