import {
  DailiesSettingsPayloadSchema,
  DeckBuilderSettingsPayloadSchema,
  DeckSuggestSettingsPayloadSchema,
  DECK_BUILDER_SETTINGS_EVENT,
  OrderReconcileSettingsPayloadSchema,
  SettingsResponseSchema,
  type DailiesSettingsPayload,
  type DeckBuilderSettingsPayload,
  type DeckSuggestSettingsPayload,
  type OrderReconcileSettingsPayload,
} from '@rayenz-hub/shared';
import { getDailiesSettingsApi, getHubStorage } from '../lib/hub-storage';
import {
  assertApiNotPageOrigin,
  getHubApiConfig,
  setHubApiConfig,
  clearHubApiConfig,
  isApiConfigured,
  HubApiClient,
  clientApiFetch,
  pushSettingsDomain,
} from './hub-api-client';

export type { HubApiConfig } from './hub-api-client';
export {
  getHubApiConfig,
  setHubApiConfig,
  clearHubApiConfig,
  isApiConfigured,
  assertApiNotPageOrigin,
  HubApiClient,
};

type SafeParseSchema<T> = {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false };
  parse: (data: unknown) => T;
};

type SettingsDomainConfig<T> = {
  domain: string;
  schema: SafeParseSchema<T>;
  readLocal: () => T | null;
  writeLocal: (payload: T) => void;
  onPersist?: (payload: T) => void;
  /** When true (dailies), keep localStorage-first dual-mode. When false (MTG), API-or-nothing. */
  allowLocalFallback: boolean;
};

function createSettingsDomain<T>(config: SettingsDomainConfig<T>) {
  const { domain, schema, readLocal, writeLocal, onPersist, allowLocalFallback } = config;
  /** Same-session cache for API-or-nothing domains (never localStorage). */
  let sessionCache: T | null = null;

  async function fetchRemote(): Promise<T | null> {
    const data = await apiFetch<unknown>(`/v1/settings/${domain}`);
    if (!data) {
      return null;
    }
    const parsed = SettingsResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error('Invalid settings response from API');
    }
    const payload = schema.safeParse(parsed.data.payload);
    if (!payload.success) {
      throw new Error(`Invalid ${domain} payload from API`);
    }
    return payload.data;
  }

  async function load(): Promise<{
    settings: T | null;
    source: 'api' | 'local' | 'none';
  }> {
    if (!allowLocalFallback) {
      if (!getHubApiConfig().enabled) {
        return { settings: sessionCache, source: 'none' };
      }
      const remote = await fetchRemote();
      if (remote) {
        sessionCache = remote;
        writeLocal(remote);
        return { settings: remote, source: 'api' };
      }
      return { settings: sessionCache, source: sessionCache ? 'api' : 'none' };
    }

    if (getHubApiConfig().enabled) {
      try {
        const remote = await fetchRemote();
        if (remote) {
          writeLocal(remote);
          return { settings: remote, source: 'api' };
        }
      } catch {
        /* fall through to local */
      }
    }
    const local = readLocal();
    return { settings: local, source: local ? 'local' : 'none' };
  }

  async function persist(payload: T): Promise<'api' | 'local'> {
    const body = schema.parse(payload);
    if (!allowLocalFallback) {
      if (!getHubApiConfig().enabled) {
        throw new Error('Hub API not configured');
      }
      sessionCache = body;
      writeLocal(body);
      onPersist?.(body);
      await pushSettingsDomain(domain, body);
      return 'api';
    }
    writeLocal(body);
    onPersist?.(body);
    if (getHubApiConfig().enabled) {
      await pushSettingsDomain(domain, body);
      return 'api';
    }
    return 'local';
  }

  return { load, persist };
}

/** Typed settings/deck helpers over the shared low-level client fetch. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = init.headers;
    if (h instanceof Headers) {
      h.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(h)) {
      for (const [key, value] of h) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, h);
    }
  }

  let body: unknown;
  if (init?.body != null) {
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        throw new Error('apiFetch expects JSON string bodies');
      }
    } else {
      throw new Error('apiFetch only supports string JSON bodies');
    }
  }

  return (await clientApiFetch(path, {
    method: init?.method,
    headers,
    body,
  })) as T | null;
}

function readLocalDailies(): DailiesSettingsPayload | null {
  const storage = getHubStorage();
  const dailiesApi = getDailiesSettingsApi();
  const raw = storage?.loadDailiesSettings?.() || null;
  const fromLs = raw ? DailiesSettingsPayloadSchema.safeParse(raw) : null;
  const base = fromLs?.success ? fromLs.data : null;
  const mainPetName = dailiesApi?.getMainPet?.() || base?.mainPetName || '';
  const mainPetSlug = dailiesApi?.getMainPetSlug?.() || base?.mainPetSlug || '';
  if (!base && !mainPetName) {
    return null;
  }
  return {
    ...(base || {}),
    mainPetName: mainPetName || undefined,
    mainPetSlug: mainPetSlug || undefined,
  };
}

function writeLocalDailies(payload: DailiesSettingsPayload): void {
  const storage = getHubStorage();
  const dailiesApi = getDailiesSettingsApi();
  const { mainPetName, mainPetSlug, ...rest } = payload;
  if (storage?.saveDailiesSettings) {
    storage.saveDailiesSettings({ ...rest, mainPetName, mainPetSlug });
  } else {
    try {
      localStorage.setItem('rayenz-dailies-settings', JSON.stringify({ ...rest, mainPetName, mainPetSlug }));
    } catch {
      /* ignore */
    }
  }
  if (dailiesApi?.saveMainPet) {
    dailiesApi.saveMainPet(mainPetName || '', mainPetSlug || null);
  } else {
    try {
      if (mainPetName) {
        localStorage.setItem('rayenz-main-pet', mainPetName);
        if (mainPetSlug) {
          localStorage.setItem('rayenz-main-pet-slug', mainPetSlug);
        }
      }
    } catch {
      /* ignore */
    }
  }
}

function readMemorySettings<T>(
  schema: SafeParseSchema<T>,
  loadFromStorage: (() => unknown) | undefined,
): T | null {
  const raw = loadFromStorage?.();
  if (!raw) {
    return null;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const dailiesDomain = createSettingsDomain({
  domain: 'dailies',
  schema: DailiesSettingsPayloadSchema,
  readLocal: readLocalDailies,
  writeLocal: writeLocalDailies,
  allowLocalFallback: true,
});

const deckSuggestDomain = createSettingsDomain({
  domain: 'deck-suggest',
  schema: DeckSuggestSettingsPayloadSchema,
  readLocal: () =>
    readMemorySettings(DeckSuggestSettingsPayloadSchema, () => getHubStorage()?.loadDeckSuggestSettings?.()),
  writeLocal: (payload) => {
    getHubStorage()?.saveDeckSuggestSettings?.(payload as Record<string, unknown>);
  },
  allowLocalFallback: false,
});

const orderReconcileDomain = createSettingsDomain({
  domain: 'order-reconcile',
  schema: OrderReconcileSettingsPayloadSchema,
  readLocal: () =>
    readMemorySettings(
      OrderReconcileSettingsPayloadSchema,
      () => getHubStorage()?.loadOrderReconcileSettings?.(),
    ),
  writeLocal: (payload) => {
    getHubStorage()?.saveOrderReconcileSettings?.(payload as Record<string, unknown>);
  },
  allowLocalFallback: false,
});

const deckBuilderDomain = createSettingsDomain({
  domain: 'deck-builder',
  schema: DeckBuilderSettingsPayloadSchema,
  readLocal: () =>
    readMemorySettings(DeckBuilderSettingsPayloadSchema, () => getHubStorage()?.loadDeckBuilderSettings?.()),
  writeLocal: (payload) => {
    getHubStorage()?.saveDeckBuilderSettings?.(payload as Record<string, unknown>);
  },
  allowLocalFallback: false,
  onPersist: (body) => {
    try {
      window.dispatchEvent(new CustomEvent(DECK_BUILDER_SETTINGS_EVENT, { detail: body }));
    } catch {
      /* ignore */
    }
  },
});

export const loadDailiesSettings = dailiesDomain.load;
export const persistDailiesSettings = dailiesDomain.persist;
export const loadDeckSuggestSettings = deckSuggestDomain.load;
export const persistDeckSuggestSettings = deckSuggestDomain.persist;
export const loadOrderReconcileSettings = orderReconcileDomain.load;
export const persistOrderReconcileSettings = orderReconcileDomain.persist;
export const loadDeckBuilderSettings = deckBuilderDomain.load;
export const persistDeckBuilderSettings = deckBuilderDomain.persist;

/** @deprecated use loadDailiesSettings / persistDailiesSettings */
export async function fetchDailiesSettings(): Promise<DailiesSettingsPayload | null> {
  const { settings } = await loadDailiesSettings();
  return settings;
}

/** @deprecated use persistDailiesSettings */
export async function saveDailiesSettings(payload: DailiesSettingsPayload): Promise<void> {
  await persistDailiesSettings(payload);
}
