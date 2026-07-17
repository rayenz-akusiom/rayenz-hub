export type HubPath =
  | '/dailies'
  | '/neopets-more'
  | '/deck-builder'
  | '/deck-suggest'
  | '/deck-review'
  | '/order-reconcile'
  | '/settings'
  | '/settings/dailies'
  | '/settings/deck-builder'
  | '/settings/deck-suggest'
  | '/settings/order-reconcile';

export const DEFAULT_PATH: HubPath = '/dailies';

/** Hub user segment in deck deep links (`#/deck-builder/{user}/{deck}`). */
export const HUB_USER_SLUG = 'default';

export type DeckBuilderRoute = {
  userSlug: string;
  deckSlug: string;
};

export const KNOWN_PATHS = new Set<string>([
  '/dailies',
  '/neopets-more',
  '/deck-builder',
  '/deck-suggest',
  '/deck-review',
  '/order-reconcile',
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
  'deck-builder': '#/deck-builder',
  'deck-suggest': '#/deck-suggest',
  'deck-review': '#/deck-review',
  'order-reconcile': '#/order-reconcile',
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
  if (KNOWN_PATHS.has(path)) {
    return path as HubPath;
  }
  if (path === '/deck-builder' || path.startsWith('/deck-builder/')) {
    return '/deck-builder';
  }
  if (path === '/settings' || path.startsWith('/settings/')) {
    return '/settings/dailies';
  }
  return DEFAULT_PATH;
}

/**
 * Parse `#/deck-builder/:user/:deck` deep links.
 * Returns null for library (`#/deck-builder`) or malformed nested paths.
 */
export function parseDeckBuilderRoute(hash?: string | null): DeckBuilderRoute | null {
  const normalized = normalizeHash(hash ?? (typeof window !== 'undefined' ? window.location.hash : ''));
  const path = normalized.slice(1);
  if (!path.startsWith('/deck-builder/')) return null;
  const rest = path.slice('/deck-builder/'.length);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const [userSlug, deckSlug] = parts;
  if (!userSlug || !deckSlug) return null;
  return { userSlug, deckSlug };
}

/** Build `#/deck-builder` or `#/deck-builder/:user/:deck`. */
export function deckBuilderHash(userSlug?: string | null, deckSlug?: string | null): string {
  if (userSlug && deckSlug) {
    return `#/deck-builder/${userSlug}/${deckSlug}`;
  }
  return '#/deck-builder';
}

export function isSettingsPath(path: string): boolean {
  return path === '/settings' || path.startsWith('/settings/');
}

export function isLegacyPath(path: string): boolean {
  return LEGACY_PATHS.has(path);
}
