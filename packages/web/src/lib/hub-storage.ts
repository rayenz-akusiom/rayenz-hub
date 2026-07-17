/**
 * Hub localStorage / session handoff (full TS port of shared/storage.js).
 */
import {
  getHubApiConfig,
  pushReviewProgress as apiPushReviewProgress,
  pullReviewProgress as apiPullReviewProgress,
  pushSetPool as apiPushSetPool,
  pullSetPool as apiPullSetPool,
  pushSettingsDomain,
} from '../api/hub-api-client';

const ROUTE_KEY = 'rayenz-hub-route';
const REVIEW_PREFIX = 'rayenz-deck-review-';
const ORDER_RECONCILE_SETTINGS_KEY = 'rayenz-order-reconcile-settings';
const ORDER_RECONCILE_PROGRESS_PREFIX = 'rayenz-order-reconcile-';
const DECK_SUGGEST_SETTINGS_KEY = 'rayenz-deck-suggest-settings';
const DECK_BUILDER_SETTINGS_KEY = 'rayenz-deck-builder-settings';
const SET_POOL_CACHE_PREFIX = 'rayenz-deck-suggest-set-pool-';
const REVIEW_HANDOFF_KEY = 'rayenz-deck-suggest-review-handoff';
const DAILIES_SETTINGS_KEY = 'rayenz-dailies-settings';

type HubWindow = Window & { __hubReviewHandoff?: unknown };

function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function getLastRoute(): string {
  return getItem(ROUTE_KEY) || '#/dailies';
}

export function setLastRoute(route: string): void {
  setItem(ROUTE_KEY, route);
}

function reviewFileKey(fileId: string): string {
  return REVIEW_PREFIX + fileId;
}

export type ReviewProgress = {
  decisions: Record<string, unknown>;
  currentDeckId: string | null;
  currentSuggestionIndex: Record<string, number>;
};

function emptyReviewProgress(): ReviewProgress {
  return { decisions: {}, currentDeckId: null, currentSuggestionIndex: {} };
}

function loadReviewProgressLocal(fileId: string): ReviewProgress {
  const raw = getItem(reviewFileKey(fileId));
  if (!raw) {
    return emptyReviewProgress();
  }
  try {
    return JSON.parse(raw) as ReviewProgress;
  } catch {
    return emptyReviewProgress();
  }
}

export function loadReviewProgress(fileId: string): ReviewProgress {
  return loadReviewProgressLocal(fileId);
}

export function saveReviewProgress(fileId: string, progress: ReviewProgress): void {
  setItem(reviewFileKey(fileId), JSON.stringify(progress));
  if (getHubApiConfig().enabled) {
    void apiPushReviewProgress(fileId, progress || {}).catch(() => {});
  }
}

export function hydrateReviewProgressFromApi(fileId: string): Promise<ReviewProgress> {
  if (!fileId || !getHubApiConfig().enabled) {
    return Promise.resolve(loadReviewProgressLocal(fileId));
  }
  return apiPullReviewProgress(fileId)
    .then((remote) => {
      if (!remote) {
        return loadReviewProgressLocal(fileId);
      }
      setItem(reviewFileKey(fileId), JSON.stringify(remote));
      return remote;
    })
    .catch(() => loadReviewProgressLocal(fileId));
}

export function fileIdFromMeta(meta: { set_code?: string; generated_at?: string } | null | undefined): string {
  return (meta?.set_code || 'unknown') + '-' + (meta?.generated_at || 'undated');
}

const DEFAULT_ORDER_RECONCILE_SETTINGS = {
  stagingDeckUrl: '',
  registrySource: 'folder',
  folderUrl: '',
  customDeckUrls: '',
};

export function loadOrderReconcileSettings(): Record<string, unknown> {
  const raw = getItem(ORDER_RECONCILE_SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_ORDER_RECONCILE_SETTINGS };
  }
  try {
    return { ...DEFAULT_ORDER_RECONCILE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_ORDER_RECONCILE_SETTINGS };
  }
}

export function saveOrderReconcileSettings(settings: Record<string, unknown>): void {
  setItem(ORDER_RECONCILE_SETTINGS_KEY, JSON.stringify(settings || {}));
  if (getHubApiConfig().enabled) {
    void pushSettingsDomain('order-reconcile', settings || {}).catch(() => {});
  }
}

function orderReconcileSessionKey(sessionId?: string): string {
  return ORDER_RECONCILE_PROGRESS_PREFIX + (sessionId || 'default');
}

export function loadOrderReconcileProgress(sessionId?: string): Record<string, unknown> {
  const raw = getItem(orderReconcileSessionKey(sessionId));
  if (!raw) {
    return {
      decisions: {},
      assignments: [],
      needsReview: [],
      copies: [],
      acquiredCards: [],
      activeDeckId: null,
      phase: 'input',
      completedDecks: {},
    };
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      decisions: {},
      assignments: [],
      needsReview: [],
      copies: [],
      acquiredCards: [],
      activeDeckId: null,
      phase: 'input',
      completedDecks: {},
    };
  }
}

export function saveOrderReconcileProgress(sessionId: string | undefined, progress: Record<string, unknown>): void {
  setItem(orderReconcileSessionKey(sessionId), JSON.stringify(progress || {}));
}

const DEFAULT_DECK_SUGGEST_SETTINGS = {
  folderUrl: '',
  setCodes: '',
  deckLoadTab: null as string | null,
  customDeckUrls: '',
  pasteDeckImport: '',
  pasteDeckName: '',
  pasteDeckUrl: '',
  rulesDebug: false,
};

export function loadDeckSuggestSettings(): Record<string, unknown> {
  const raw = getItem(DECK_SUGGEST_SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_DECK_SUGGEST_SETTINGS };
  }
  try {
    return { ...DEFAULT_DECK_SUGGEST_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DECK_SUGGEST_SETTINGS };
  }
}

export function saveDeckSuggestSettings(settings: Record<string, unknown>): void {
  setItem(DECK_SUGGEST_SETTINGS_KEY, JSON.stringify(settings || {}));
  if (getHubApiConfig().enabled) {
    void pushSettingsDomain('deck-suggest', settings || {}).catch(() => {});
  }
}

const DEFAULT_DECK_BUILDER_SETTINGS = {
  allyThreeColourNames: 'shards',
  enemyThreeColourNames: 'wedges',
};

export function loadDeckBuilderSettings(): Record<string, unknown> {
  const raw = getItem(DECK_BUILDER_SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_DECK_BUILDER_SETTINGS };
  }
  try {
    return { ...DEFAULT_DECK_BUILDER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DECK_BUILDER_SETTINGS };
  }
}

export function saveDeckBuilderSettings(settings: Record<string, unknown>): void {
  setItem(DECK_BUILDER_SETTINGS_KEY, JSON.stringify(settings || {}));
  if (getHubApiConfig().enabled) {
    void pushSettingsDomain('deck-builder', settings || {}).catch(() => {});
  }
}

export function normalizeSetCodesKey(codes: string[] | null | undefined): string {
  return (codes || [])
    .map((c) => String(c).trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join(',');
}

function setPoolCacheKey(codesKey: string): string {
  return SET_POOL_CACHE_PREFIX + codesKey;
}

export type SetPoolScope = {
  complete: boolean;
  codes?: string[];
  codesKey?: string;
  cards?: unknown[];
  primaryCode?: string;
  setName?: string;
  formatVersion?: number;
  [key: string]: unknown;
};

export function saveSetPoolCache(codesKey: string, scope: SetPoolScope): boolean {
  if (!codesKey || !scope || scope.complete !== true) {
    return false;
  }
  try {
    setItem(setPoolCacheKey(codesKey), JSON.stringify(scope));
    if (getHubApiConfig().enabled) {
      void apiPushSetPool(codesKey, scope).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export function loadSetPoolCache(codesKey: string): SetPoolScope | null {
  if (!codesKey) {
    return null;
  }
  const raw = getItem(setPoolCacheKey(codesKey));
  if (!raw) {
    return null;
  }
  try {
    const scope = JSON.parse(raw) as SetPoolScope;
    if (!scope || scope.complete !== true) {
      return null;
    }
    return scope;
  } catch {
    return null;
  }
}

export function hydrateSetPoolFromApi(codesKey: string): Promise<SetPoolScope | null> {
  if (!codesKey || !getHubApiConfig().enabled) {
    return Promise.resolve(loadSetPoolCache(codesKey));
  }
  return apiPullSetPool(codesKey)
    .then((remote) => {
      if (!remote || remote.complete !== true) {
        return loadSetPoolCache(codesKey);
      }
      try {
        setItem(setPoolCacheKey(codesKey), JSON.stringify(remote));
      } catch {
        /* ignore quota */
      }
      return remote;
    })
    .catch(() => loadSetPoolCache(codesKey));
}

export function clearSetPoolCache(codesKey: string): void {
  if (!codesKey) {
    return;
  }
  try {
    localStorage.removeItem(setPoolCacheKey(codesKey));
  } catch {
    /* ignore */
  }
}

function saveMemoryReviewHandoff(payload: unknown): boolean {
  try {
    (window as HubWindow).__hubReviewHandoff = payload;
    return true;
  } catch {
    return false;
  }
}

export function consumeMemoryReviewHandoff(): unknown {
  const w = window as HubWindow;
  const payload = w.__hubReviewHandoff;
  delete w.__hubReviewHandoff;
  return payload || null;
}

export function saveReviewHandoff(payload: unknown): boolean {
  const memoryOk = saveMemoryReviewHandoff(payload);
  try {
    sessionStorage.setItem(REVIEW_HANDOFF_KEY, JSON.stringify(payload || {}));
    return true;
  } catch {
    return memoryOk;
  }
}

export function consumeReviewHandoff(): unknown {
  const memory = consumeMemoryReviewHandoff();
  if (memory) {
    try {
      sessionStorage.removeItem(REVIEW_HANDOFF_KEY);
    } catch {
      /* ignore */
    }
    return memory;
  }
  try {
    const raw = sessionStorage.getItem(REVIEW_HANDOFF_KEY);
    if (!raw) {
      return null;
    }
    sessionStorage.removeItem(REVIEW_HANDOFF_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const DEFAULT_WISHLISTS = [
  {
    id: 'stamps-wishlist',
    label: 'Stamps Wishlist',
    listUrl: 'https://itemdb.com.br/lists/rayenz/all-collectibles-checklist',
    slug: 'all-collectibles-checklist',
    user: 'rayenz',
    img: 'https://images.neopets.com/items/d3cf0h2ki5.gif',
  },
  {
    id: 'gourmet-food',
    label: 'Gourmet Food',
    listUrl: 'https://itemdb.com.br/lists/rayenz/gourmet-food-checklist',
    slug: 'gourmet-food-checklist',
    user: 'rayenz',
    img: 'https://images.neopets.com/items/food_acara_cone.gif',
  },
  {
    id: 'books-checklist',
    label: 'Books',
    listUrl: 'https://itemdb.com.br/lists/rayenz/book-award-checklist-2',
    slug: 'book-award-checklist-2',
    user: 'rayenz',
    img: 'https://images.neopets.com/items/boo_acy15vii_neotradbeg.gif',
  },
  {
    id: 'booktastic-checklist',
    label: 'Booktastic',
    listUrl: 'https://itemdb.com.br/lists/rayenz/booktastic-book-award-checklist-2',
    slug: 'booktastic-book-award-checklist-2',
    user: 'rayenz',
    img: 'https://images.neopets.com/items/boo_stuck_in_space.gif',
  },
];

const DEFAULT_DAILIES_SETTINGS = {
  faerieQuest: 'illusen',
  schools: {
    swashbuckling: true,
    'mystery-island': true,
    'secret-ninja': true,
    'lab-ray': true,
    'kitchen-quests': true,
    'healing-springs': true,
    battledome: true,
    'faerie-quests': true,
  },
  magmaPoolLocalTime: '14:47',
  magmaPoolBufferMinutes: 15,
  wishlists: DEFAULT_WISHLISTS,
};

export function loadDailiesSettings(): Record<string, unknown> {
  const raw = getItem(DAILIES_SETTINGS_KEY);
  if (!raw) {
    return {
      ...DEFAULT_DAILIES_SETTINGS,
      schools: { ...DEFAULT_DAILIES_SETTINGS.schools },
      wishlists: DEFAULT_WISHLISTS.map((w) => ({ ...w })),
    };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      ...DEFAULT_DAILIES_SETTINGS,
      ...parsed,
      schools: {
        ...DEFAULT_DAILIES_SETTINGS.schools,
        ...((parsed.schools as Record<string, boolean>) || {}),
      },
      wishlists: Array.isArray(parsed.wishlists)
        ? (parsed.wishlists as typeof DEFAULT_WISHLISTS).map((w) => ({ ...w }))
        : DEFAULT_WISHLISTS.map((w) => ({ ...w })),
    };
  } catch {
    return {
      ...DEFAULT_DAILIES_SETTINGS,
      schools: { ...DEFAULT_DAILIES_SETTINGS.schools },
      wishlists: DEFAULT_WISHLISTS.map((w) => ({ ...w })),
    };
  }
}

export function saveDailiesSettings(settings: Record<string, unknown>): void {
  setItem(DAILIES_SETTINGS_KEY, JSON.stringify(settings || {}));
  if (getHubApiConfig().enabled) {
    void pushSettingsDomain('dailies', settings || {}).catch(() => {});
  }
}

export const HubStorage = {
  getLastRoute,
  setLastRoute,
  loadReviewProgress,
  saveReviewProgress,
  hydrateReviewProgressFromApi,
  fileIdFromMeta,
  loadOrderReconcileSettings,
  saveOrderReconcileSettings,
  loadOrderReconcileProgress,
  saveOrderReconcileProgress,
  loadDeckSuggestSettings,
  saveDeckSuggestSettings,
  loadDeckBuilderSettings,
  saveDeckBuilderSettings,
  normalizeSetCodesKey,
  saveSetPoolCache,
  loadSetPoolCache,
  hydrateSetPoolFromApi,
  clearSetPoolCache,
  saveReviewHandoff,
  consumeReviewHandoff,
  consumeMemoryReviewHandoff,
  loadDailiesSettings,
  saveDailiesSettings,
};

type HubHost = Window & {
  HubStorage?: typeof HubStorage;
  DailiesSettings?: {
    getMainPet: () => string;
    getMainPetSlug: () => string;
    saveMainPet: (name: string, slug: string | null) => void;
    getWishlists: (settings: unknown) => unknown[];
  };
  HubRouter?: {
    navigate: (hash: string) => void;
  };
};

function host(): HubHost {
  return window as HubHost;
}

/** Prefer installed globals after installHubGlobals(); falls back to module HubStorage. */
export function getHubStorage() {
  return host().HubStorage ?? HubStorage;
}

export function getDailiesSettingsApi() {
  return host().DailiesSettings ?? null;
}

export function navigateHub(hash: string) {
  const normalized = hash.startsWith('#') ? hash : `#${hash}`;
  const h = host();
  if (h.HubRouter?.navigate) {
    h.HubRouter.navigate(normalized);
    return;
  }
  window.location.hash = normalized;
}

/** @deprecated Prefer navigateHub — kept for call-site compatibility. */
export function setParentHash(path: string) {
  navigateHub(path);
}
