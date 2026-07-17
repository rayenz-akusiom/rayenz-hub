import { CORE_SCRIPTS, ensureCoreScripts, loadScript } from './core-scripts';

/** Remaining shared scripts for vanilla MTG / More apps. */
export const LEGACY_SHARED_SCRIPTS = [
  'shared/hub-utils.js',
  'shared/scryfall-cache.js',
  'shared/hub-progress.js',
  'shared/swap-queue.js',
  'shared/suggestions-bundle.js',
  'shared/cut-candidates.js',
] as const;

export const LEGACY_APP_SCRIPTS = [
  'apps/deck-review/archidekt-export.js',
  'apps/deck-review/profile-sync.js',
  'apps/deck-review/deck-review.js',
  'apps/deck-review/dr-data.js',
  'apps/deck-review/dr-pickers.js',
  'apps/deck-review/dr-profiles.js',
  'apps/deck-review/dr-decisions.js',
  'apps/deck-review/dr-render.js',
  'apps/order-reconcile/email-parse.js',
  'apps/order-reconcile/order-reconcile-export.js',
  'apps/order-reconcile/order-reconcile.js',
  'apps/order-reconcile/or-data.js',
  'apps/order-reconcile/or-summary.js',
  'apps/order-reconcile/or-assign.js',
  'apps/order-reconcile/or-reconcile.js',
  'apps/order-reconcile/or-input.js',
  'apps/deck-suggest/deck-suggest.js',
  'apps/deck-suggest/ds-rules-roles.js',
  'apps/deck-suggest/ds-tagger.js',
  'apps/deck-suggest/ds-rules-queue.js',
  'apps/deck-suggest/ds-rules-proxy.js',
  'apps/deck-suggest/ds-rules.js',
  'apps/deck-suggest/ds-data.js',
  'apps/deck-suggest/ds-export.js',
  'apps/deck-suggest/ds-render.js',
] as const;

let loadPromise: Promise<void> | null = null;

export async function ensureLegacyScripts(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await ensureCoreScripts();
    for (const src of LEGACY_SHARED_SCRIPTS) {
      await loadScript(src);
    }
    for (const src of LEGACY_APP_SCRIPTS) {
      await loadScript(src);
    }
  })();
  try {
    await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

type LegacyLoader = (root: HTMLElement) => void | Promise<void>;

export function getLegacyLoader(path: string): LegacyLoader | null {
  const w = window as Window & {
    loadDeckReviewApp?: LegacyLoader;
    loadDeckSuggestApp?: LegacyLoader;
    loadOrderReconcileApp?: LegacyLoader;
  };
  switch (path) {
    case '/deck-review':
      return w.loadDeckReviewApp ?? null;
    case '/deck-suggest':
      return w.loadDeckSuggestApp ?? null;
    case '/order-reconcile':
      return w.loadOrderReconcileApp ?? null;
    default:
      return null;
  }
}

export { CORE_SCRIPTS };
