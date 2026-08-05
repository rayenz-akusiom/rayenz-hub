/** Shared Hub glance POST helpers (deck + swaps). */

export type GlanceDelivery = 'inline' | 'presigned' | 'bundle';

export async function getGlanceApiConfig(): Promise<{ url: string; key: string }> {
  const { getHubApiConfig, assertApiNotPageOrigin } = await import('../api/hub-api-client');
  const cfg = getHubApiConfig();
  if (!cfg.enabled) {
    throw new Error(
      'Hub API not configured. Set rayenz-hub-api-url and rayenz-hub-api-key in localStorage.',
    );
  }
  assertApiNotPageOrigin(cfg.url);
  return { url: cfg.url, key: cfg.key };
}

export async function postGlanceRequest(
  path: string,
  body: unknown,
): Promise<Response> {
  const cfg = await getGlanceApiConfig();
  const res = await fetch(`${cfg.url}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    throw new Error('Hub API unauthorized — check rayenz-hub-api-key.');
  }
  if (!res.ok) {
    const peek = await res.text();
    try {
      const json = JSON.parse(peek) as { error?: string; message?: string };
      throw new Error(json.error || json.message || `Hub API error ${res.status}`);
    } catch (parseErr) {
      if (parseErr instanceof Error && !parseErr.message.startsWith('Unexpected')) throw parseErr;
      throw new Error(`Hub API error ${res.status}: ${peek}`);
    }
  }
  return res;
}

export function glanceResponseMeta(res: Response): {
  cache: string | null;
  generation: string | null;
  densify: string | null;
  contentType: string;
} {
  return {
    cache: res.headers.get('x-glance-cache'),
    generation: res.headers.get('x-glance-generation'),
    densify: res.headers.get('x-glance-densify'),
    contentType: res.headers.get('content-type') || '',
  };
}

export function base64ToBlob(b64: string, type = 'image/png'): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function fetchImageBlob(url: string, label = 'glance'): Promise<Blob> {
  const imageRes = await fetch(url);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch ${label} image (${imageRes.status}).`);
  }
  return imageRes.blob();
}
