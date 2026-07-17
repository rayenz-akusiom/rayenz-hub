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

/** @deprecated Empty — all routes are React-owned; MTG apps use VanillaMtgApp. */
export const LEGACY_PATHS = new Set<string>();

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
  if (path === '/settings' || path.startsWith('/settings/')) {
    return '/settings/dailies';
  }
  return DEFAULT_PATH;
}

export function isSettingsPath(path: string): boolean {
  return path === '/settings' || path.startsWith('/settings/');
}

export function isLegacyPath(path: string): boolean {
  return LEGACY_PATHS.has(path);
}
