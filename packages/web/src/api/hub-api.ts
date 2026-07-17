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
  isApiConfigured,
  HubApiClient,
  parseHubApiJsonBody,
} from './hub-api-client';

export type { HubApiConfig } from './hub-api-client';
export { getHubApiConfig, isApiConfigured, HubApiClient };

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const cfg = getHubApiConfig();
  if (!cfg.enabled) {
    throw new Error('Hub API not configured. Set rayenz-hub-api-url and rayenz-hub-api-key in localStorage.');
  }
  assertApiNotPageOrigin(cfg.url);
  const fullUrl = `${cfg.url}${path}`;
  const res = await fetch(fullUrl, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const peek = await res.text();
  if (res.status === 404) {
    return null;
  }
  if (res.status === 401) {
    throw new Error('Hub API unauthorized — check rayenz-hub-api-key.');
  }
  if (!res.ok) {
    throw new Error(`Hub API error ${res.status}: ${peek}`);
  }
  if (res.status === 204) {
    return null;
  }
  return parseHubApiJsonBody(peek, fullUrl, cfg.url) as T;
}

async function fetchDomainPayload<T>(
  domain: string,
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } },
): Promise<T | null> {
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

async function saveDomainPayload(domain: string, payload: unknown): Promise<void> {
  await apiFetch(`/v1/settings/${domain}`, {
    method: 'PUT',
    body: JSON.stringify({ payload }),
  });
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

export async function loadDailiesSettings(): Promise<{
  settings: DailiesSettingsPayload | null;
  source: 'api' | 'local' | 'none';
}> {
  const cfg = getHubApiConfig();
  if (cfg.enabled) {
    try {
      const remote = await fetchDomainPayload('dailies', DailiesSettingsPayloadSchema);
      if (remote) {
        writeLocalDailies(remote);
        return { settings: remote, source: 'api' };
      }
    } catch {
      /* fall through to local */
    }
  }
  const local = readLocalDailies();
  return { settings: local, source: local ? 'local' : 'none' };
}

export async function persistDailiesSettings(payload: DailiesSettingsPayload): Promise<'api' | 'local'> {
  const body = DailiesSettingsPayloadSchema.parse(payload);
  writeLocalDailies(body);
  const cfg = getHubApiConfig();
  if (cfg.enabled) {
    await saveDomainPayload('dailies', body);
    return 'api';
  }
  return 'local';
}

function readLocalDeckSuggest(): DeckSuggestSettingsPayload | null {
  const raw = getHubStorage()?.loadDeckSuggestSettings?.();
  if (!raw) {
    return null;
  }
  const parsed = DeckSuggestSettingsPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function writeLocalDeckSuggest(payload: DeckSuggestSettingsPayload): void {
  const storage = getHubStorage();
  if (storage?.saveDeckSuggestSettings) {
    storage.saveDeckSuggestSettings(payload as Record<string, unknown>);
  } else {
    try {
      localStorage.setItem('rayenz-deck-suggest-settings', JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
}

export async function loadDeckSuggestSettings(): Promise<{
  settings: DeckSuggestSettingsPayload | null;
  source: 'api' | 'local' | 'none';
}> {
  const cfg = getHubApiConfig();
  if (cfg.enabled) {
    try {
      const remote = await fetchDomainPayload('deck-suggest', DeckSuggestSettingsPayloadSchema);
      if (remote) {
        writeLocalDeckSuggest(remote);
        return { settings: remote, source: 'api' };
      }
    } catch {
      /* local fallback */
    }
  }
  const local = readLocalDeckSuggest();
  return { settings: local, source: local ? 'local' : 'none' };
}

export async function persistDeckSuggestSettings(
  payload: DeckSuggestSettingsPayload,
): Promise<'api' | 'local'> {
  const body = DeckSuggestSettingsPayloadSchema.parse(payload);
  writeLocalDeckSuggest(body);
  if (getHubApiConfig().enabled) {
    await saveDomainPayload('deck-suggest', body);
    return 'api';
  }
  return 'local';
}

function readLocalOrderReconcile(): OrderReconcileSettingsPayload | null {
  const raw = getHubStorage()?.loadOrderReconcileSettings?.();
  if (!raw) {
    return null;
  }
  const parsed = OrderReconcileSettingsPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function writeLocalOrderReconcile(payload: OrderReconcileSettingsPayload): void {
  const storage = getHubStorage();
  if (storage?.saveOrderReconcileSettings) {
    storage.saveOrderReconcileSettings(payload as Record<string, unknown>);
  } else {
    try {
      localStorage.setItem('rayenz-order-reconcile-settings', JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
}

export async function loadOrderReconcileSettings(): Promise<{
  settings: OrderReconcileSettingsPayload | null;
  source: 'api' | 'local' | 'none';
}> {
  const cfg = getHubApiConfig();
  if (cfg.enabled) {
    try {
      const remote = await fetchDomainPayload('order-reconcile', OrderReconcileSettingsPayloadSchema);
      if (remote) {
        writeLocalOrderReconcile(remote);
        return { settings: remote, source: 'api' };
      }
    } catch {
      /* local fallback */
    }
  }
  const local = readLocalOrderReconcile();
  return { settings: local, source: local ? 'local' : 'none' };
}

export async function persistOrderReconcileSettings(
  payload: OrderReconcileSettingsPayload,
): Promise<'api' | 'local'> {
  const body = OrderReconcileSettingsPayloadSchema.parse(payload);
  writeLocalOrderReconcile(body);
  if (getHubApiConfig().enabled) {
    await saveDomainPayload('order-reconcile', body);
    return 'api';
  }
  return 'local';
}

function readLocalDeckBuilder(): DeckBuilderSettingsPayload | null {
  const raw = getHubStorage()?.loadDeckBuilderSettings?.();
  if (!raw) {
    try {
      const ls = localStorage.getItem('rayenz-deck-builder-settings');
      if (!ls) return null;
      const parsed = DeckBuilderSettingsPayloadSchema.safeParse(JSON.parse(ls));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
  const parsed = DeckBuilderSettingsPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function writeLocalDeckBuilder(payload: DeckBuilderSettingsPayload): void {
  const storage = getHubStorage();
  if (storage?.saveDeckBuilderSettings) {
    storage.saveDeckBuilderSettings(payload as Record<string, unknown>);
  } else {
    try {
      localStorage.setItem('rayenz-deck-builder-settings', JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
}

export async function loadDeckBuilderSettings(): Promise<{
  settings: DeckBuilderSettingsPayload | null;
  source: 'api' | 'local' | 'none';
}> {
  const cfg = getHubApiConfig();
  if (cfg.enabled) {
    try {
      const remote = await fetchDomainPayload('deck-builder', DeckBuilderSettingsPayloadSchema);
      if (remote) {
        writeLocalDeckBuilder(remote);
        return { settings: remote, source: 'api' };
      }
    } catch {
      /* local fallback */
    }
  }
  const local = readLocalDeckBuilder();
  return { settings: local, source: local ? 'local' : 'none' };
}

export async function persistDeckBuilderSettings(
  payload: DeckBuilderSettingsPayload,
): Promise<'api' | 'local'> {
  const body = DeckBuilderSettingsPayloadSchema.parse(payload);
  writeLocalDeckBuilder(body);
  try {
    window.dispatchEvent(new CustomEvent(DECK_BUILDER_SETTINGS_EVENT, { detail: body }));
  } catch {
    /* ignore */
  }
  if (getHubApiConfig().enabled) {
    await saveDomainPayload('deck-builder', body);
    return 'api';
  }
  return 'local';
}

/** @deprecated use loadDailiesSettings / persistDailiesSettings */
export async function fetchDailiesSettings(): Promise<DailiesSettingsPayload | null> {
  const { settings } = await loadDailiesSettings();
  return settings;
}

/** @deprecated use persistDailiesSettings */
export async function saveDailiesSettings(payload: DailiesSettingsPayload): Promise<void> {
  await persistDailiesSettings(payload);
}
