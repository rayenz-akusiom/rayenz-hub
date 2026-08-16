/**
 * Hub storage: dailies still use localStorage; MTG durable state is in-memory + Hub API/DDB.
 * UI prefs (route) and session handoff remain browser-local.
 */
import { SET_POOL_FORMAT_VERSION } from '@rayenz-hub/shared';
import {
  getHubApiConfig,
  pushReviewProgress as apiPushReviewProgress,
  pullReviewProgress as apiPullReviewProgress,
  pushSetPool as apiPushSetPool,
  pullSetPool as apiPullSetPool,
  pushSettingsDomain,
} from '../api/hub-api-client';

const ROUTE_KEY = 'rayenz-hub-route';
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

export type ReviewProgress = {
  decisions: Record<string, unknown>;
  currentDeckId: string | null;
  currentSuggestionIndex: Record<string, number>;
};

function emptyReviewProgress(): ReviewProgress {
  return { decisions: {}, currentDeckId: null, currentSuggestionIndex: {} };
}

const reviewProgressMemory = new Map<string, ReviewProgress>();

export function loadReviewProgress(fileId: string): ReviewProgress {
  if (!fileId) {
    return emptyReviewProgress();
  }
  const cached = reviewProgressMemory.get(fileId);
  if (cached) {
    return {
      decisions: { ...cached.decisions },
      currentDeckId: cached.currentDeckId,
      currentSuggestionIndex: { ...cached.currentSuggestionIndex },
    };
  }
  return emptyReviewProgress();
}

export function saveReviewProgress(fileId: string, progress: ReviewProgress): void {
  if (!fileId) {
    return;
  }
  const next = progress || emptyReviewProgress();
  reviewProgressMemory.set(fileId, {
    decisions: { ...(next.decisions || {}) },
    currentDeckId: next.currentDeckId ?? null,
    currentSuggestionIndex: { ...(next.currentSuggestionIndex || {}) },
  });
  if (getHubApiConfig().enabled) {
    void apiPushReviewProgress(fileId, next).catch(() => {});
  }
}

export function hydrateReviewProgressFromApi(fileId: string): Promise<ReviewProgress> {
  if (!fileId) {
    return Promise.resolve(emptyReviewProgress());
  }
  if (!getHubApiConfig().enabled) {
    return Promise.resolve(loadReviewProgress(fileId));
  }
  return apiPullReviewProgress(fileId)
    .then((remote) => {
      if (!remote) {
        return loadReviewProgress(fileId);
      }
      const next: ReviewProgress = {
        decisions: { ...(remote.decisions || {}) },
        currentDeckId: remote.currentDeckId ?? null,
        currentSuggestionIndex: { ...(remote.currentSuggestionIndex || {}) },
      };
      reviewProgressMemory.set(fileId, next);
      return loadReviewProgress(fileId);
    })
    .catch(() => loadReviewProgress(fileId));
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

let orderReconcileSettingsMemory: Record<string, unknown> | null = null;

export function loadOrderReconcileSettings(): Record<string, unknown> {
  if (orderReconcileSettingsMemory) {
    return { ...DEFAULT_ORDER_RECONCILE_SETTINGS, ...orderReconcileSettingsMemory };
  }
  return { ...DEFAULT_ORDER_RECONCILE_SETTINGS };
}

export function saveOrderReconcileSettings(settings: Record<string, unknown>): void {
  orderReconcileSettingsMemory = { ...(settings || {}) };
  if (getHubApiConfig().enabled) {
    void pushSettingsDomain('order-reconcile', settings || {}).catch(() => {});
  }
}

const EMPTY_ORDER_RECONCILE_PROGRESS: Record<string, unknown> = {
  decisions: {},
  assignments: [],
  needsReview: [],
  copies: [],
  acquiredCards: [],
  activeDeckId: null,
  phase: 'input',
  completedDecks: {},
};

const orderReconcileProgressMemory = new Map<string, Record<string, unknown>>();

function orderReconcileSessionKey(sessionId?: string): string {
  return sessionId || 'default';
}

export function loadOrderReconcileProgress(sessionId?: string): Record<string, unknown> {
  const key = orderReconcileSessionKey(sessionId);
  const cached = orderReconcileProgressMemory.get(key);
  if (!cached) {
    return { ...EMPTY_ORDER_RECONCILE_PROGRESS, decisions: {}, completedDecks: {} };
  }
  return {
    ...EMPTY_ORDER_RECONCILE_PROGRESS,
    ...cached,
    decisions: { ...((cached.decisions as Record<string, unknown>) || {}) },
    completedDecks: { ...((cached.completedDecks as Record<string, unknown>) || {}) },
  };
}

export function saveOrderReconcileProgress(sessionId: string | undefined, progress: Record<string, unknown>): void {
  orderReconcileProgressMemory.set(orderReconcileSessionKey(sessionId), { ...(progress || {}) });
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

let deckSuggestSettingsMemory: Record<string, unknown> | null = null;

export function loadDeckSuggestSettings(): Record<string, unknown> {
  if (deckSuggestSettingsMemory) {
    return { ...DEFAULT_DECK_SUGGEST_SETTINGS, ...deckSuggestSettingsMemory };
  }
  return { ...DEFAULT_DECK_SUGGEST_SETTINGS };
}

export function saveDeckSuggestSettings(settings: Record<string, unknown>): void {
  deckSuggestSettingsMemory = { ...(settings || {}) };
  if (getHubApiConfig().enabled) {
    void pushSettingsDomain('deck-suggest', settings || {}).catch(() => {});
  }
}

const DEFAULT_DECK_BUILDER_SETTINGS = {
  allyThreeColourNames: 'shards',
  enemyThreeColourNames: 'wedges',
};

let deckBuilderSettingsMemory: Record<string, unknown> | null = null;

export function loadDeckBuilderSettings(): Record<string, unknown> {
  if (deckBuilderSettingsMemory) {
    return { ...DEFAULT_DECK_BUILDER_SETTINGS, ...deckBuilderSettingsMemory };
  }
  return { ...DEFAULT_DECK_BUILDER_SETTINGS };
}

export function saveDeckBuilderSettings(settings: Record<string, unknown>): void {
  deckBuilderSettingsMemory = { ...(settings || {}) };
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

const setPoolMemory = new Map<string, SetPoolScope>();

export function saveSetPoolCache(codesKey: string, scope: SetPoolScope): boolean {
  if (!codesKey || !scope || scope.complete !== true) {
    return false;
  }
  const stamped = {
    ...scope,
    formatVersion: Number(scope.formatVersion) >= SET_POOL_FORMAT_VERSION
      ? Number(scope.formatVersion)
      : SET_POOL_FORMAT_VERSION,
  };
  setPoolMemory.set(codesKey, stamped);
  if (getHubApiConfig().enabled) {
    void apiPushSetPool(codesKey, stamped).catch(() => {});
  }
  return true;
}

export function loadSetPoolCache(codesKey: string): SetPoolScope | null {
  if (!codesKey) {
    return null;
  }
  const scope = setPoolMemory.get(codesKey);
  if (!scope || scope.complete !== true) {
    return null;
  }
  if (Number(scope.formatVersion || 0) < SET_POOL_FORMAT_VERSION) {
    return null;
  }
  return scope;
}

export function hydrateSetPoolFromApi(codesKey: string): Promise<SetPoolScope | null> {
  if (!codesKey) {
    return Promise.resolve(null);
  }
  if (!getHubApiConfig().enabled) {
    return Promise.resolve(loadSetPoolCache(codesKey));
  }
  return apiPullSetPool(codesKey)
    .then((remote) => {
      if (!remote || remote.complete !== true) {
        return loadSetPoolCache(codesKey);
      }
      if (Number(remote.formatVersion || 0) < SET_POOL_FORMAT_VERSION) {
        return loadSetPoolCache(codesKey);
      }
      const stamped = {
        ...(remote as SetPoolScope),
        formatVersion: Number(remote.formatVersion) || SET_POOL_FORMAT_VERSION,
      };
      setPoolMemory.set(codesKey, stamped);
      return stamped;
    })
    .catch(() => loadSetPoolCache(codesKey));
}

export function clearSetPoolCache(codesKey: string): void {
  if (!codesKey) {
    return;
  }
  setPoolMemory.delete(codesKey);
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
  trackingLists: {} as Record<string, { enabled?: boolean; img?: string }>,
};

export function loadDailiesSettings(): Record<string, unknown> {
  const raw = getItem(DAILIES_SETTINGS_KEY);
  if (!raw) {
    return {
      ...DEFAULT_DAILIES_SETTINGS,
      schools: { ...DEFAULT_DAILIES_SETTINGS.schools },
      trackingLists: {},
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
      trackingLists:
        parsed.trackingLists && typeof parsed.trackingLists === 'object'
          ? (parsed.trackingLists as Record<string, { enabled?: boolean; img?: string }>)
          : {},
      // Keep legacy wishlists for migrateTrackingLists on read
      wishlists: Array.isArray(parsed.wishlists) ? parsed.wishlists : undefined,
    };
  } catch {
    return {
      ...DEFAULT_DAILIES_SETTINGS,
      schools: { ...DEFAULT_DAILIES_SETTINGS.schools },
      trackingLists: {},
    };
  }
}

export function saveDailiesSettings(settings: Record<string, unknown>): void {
  setItem(DAILIES_SETTINGS_KEY, JSON.stringify(settings || {}));
  if (getHubApiConfig().enabled) {
    void pushSettingsDomain('dailies', settings || {}).catch(() => {});
  }
}

/** Test helper — clears MTG in-memory caches (not dailies localStorage). */
export function __resetHubStorageMemoryForTests(): void {
  reviewProgressMemory.clear();
  orderReconcileProgressMemory.clear();
  setPoolMemory.clear();
  orderReconcileSettingsMemory = null;
  deckSuggestSettingsMemory = null;
  deckBuilderSettingsMemory = null;
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
