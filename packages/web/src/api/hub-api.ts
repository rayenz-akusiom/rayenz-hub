import {
  DailiesSettingsPayloadSchema,
  SettingsResponseSchema,
  type DailiesSettingsPayload,
} from '@rayenz-hub/shared';

const API_URL_KEY = 'rayenz-hub-api-url';
const API_KEY_KEY = 'rayenz-hub-api-key';

export interface HubApiConfig {
  url: string;
  key: string;
  enabled: boolean;
}

export function getHubApiConfig(): HubApiConfig {
  let url = '';
  let key = '';
  try {
    url = (localStorage.getItem(API_URL_KEY) || '').replace(/\/$/, '');
    key = localStorage.getItem(API_KEY_KEY) || '';
  } catch {
    /* ignore */
  }
  return { url, key, enabled: !!(url && key) };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const cfg = getHubApiConfig();
  if (!cfg.enabled) {
    throw new Error('Hub API not configured. Set rayenz-hub-api-url and rayenz-hub-api-key in localStorage.');
  }
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (res.status === 404) {
    return null;
  }
  if (res.status === 401) {
    throw new Error('Hub API unauthorized — check rayenz-hub-api-key.');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hub API error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function fetchDailiesSettings(): Promise<DailiesSettingsPayload | null> {
  const data = await apiFetch<unknown>('/v1/settings/dailies');
  if (!data) {
    return null;
  }
  const parsed = SettingsResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid settings response from API');
  }
  const payload = DailiesSettingsPayloadSchema.safeParse(parsed.data.payload);
  if (!payload.success) {
    throw new Error('Invalid dailies payload from API');
  }
  return payload.data;
}

export async function saveDailiesSettings(payload: DailiesSettingsPayload): Promise<void> {
  const body = DailiesSettingsPayloadSchema.parse(payload);
  await apiFetch('/v1/settings/dailies', {
    method: 'PUT',
    body: JSON.stringify({ payload: body }),
  });
}
