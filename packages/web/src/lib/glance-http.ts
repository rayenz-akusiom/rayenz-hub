/** Shared Hub glance POST helpers (deck + swaps). */

async function getGlanceApiConfig(): Promise<{ url: string; token: string }> {
  const { getHubApiConfig, assertApiNotPageOrigin } = await import('../api/hub-api-client');
  const { getAccessToken } = await import('./hub-auth-session');
  const cfg = getHubApiConfig();
  const token = getAccessToken();
  if (!cfg.url || !token) {
    throw new Error('Hub API not configured. Set the API URL and sign in.');
  }
  assertApiNotPageOrigin(cfg.url);
  return { url: cfg.url, token };
}

export async function postGlanceRequest(
  path: string,
  body: unknown,
): Promise<Response> {
  const cfg = await getGlanceApiConfig();
  const payload = JSON.stringify(body);

  async function doFetch(accessToken: string): Promise<Response> {
    return fetch(`${cfg.url}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: payload,
    });
  }

  let res = await doFetch(cfg.token);
  if (res.status === 401) {
    const { tryRefreshAccessToken, notifyAuthRequired } = await import('./hub-auth-session');
    const refreshed = await tryRefreshAccessToken(cfg.url);
    if (refreshed) {
      res = await doFetch(refreshed);
    }
    if (res.status === 401) {
      notifyAuthRequired();
      throw new Error('Hub API unauthorized — sign in again.');
    }
  }
  if (!res.ok) {
    const peek = await res.text();
    try {
      const json = JSON.parse(peek) as { error?: string; message?: string };
      throw new Error(json.error || json.message || `Hub API error ${res.status}`);
    } catch (parseErr) {
      if (parseErr instanceof Error && !parseErr.message.startsWith('Unexpected')) throw parseErr;
    }
    throw new Error(`Hub API error ${res.status}: ${peek}`);
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

export type GlancePngMeta = {
  blob: Blob;
  cache: string | null;
  generation: string | null;
  densify: string | null;
  delivery: 'inline' | 'presigned';
};

export type GlanceJsonBody = {
  delivery?: string;
  url?: string;
  cache?: string;
  generation?: string;
  densifyStage?: string;
  pageCount?: number;
  omittedCardCount?: number;
  images?: Array<{
    index?: number;
    delivery?: string;
    url?: string;
    pngBase64?: string;
    cache?: string;
  }>;
};

/**
 * Resolve binary PNG or single-image presigned JSON.
 * Returns `{ kind: 'json', body }` when the JSON payload is not a top-level presigned URL
 * (e.g. multi-page bundle) so the caller can handle product-specific shapes.
 */
export async function resolveInlineOrPresignedPng(
  res: Response,
  label = 'glance',
): Promise<
  | ({ kind: 'png' } & GlancePngMeta)
  | { kind: 'json'; body: GlanceJsonBody; cache: string | null; generation: string | null; densify: string | null }
> {
  const { cache, generation, densify, contentType } = glanceResponseMeta(res);

  if (contentType.includes('application/json')) {
    const body = (await res.json()) as GlanceJsonBody;
    if (body.delivery === 'presigned' && body.url) {
      const blob = await fetchImageBlob(body.url, label);
      return {
        kind: 'png',
        blob,
        cache: body.cache ?? cache,
        generation: body.generation ?? generation,
        densify: body.densifyStage ?? densify,
        delivery: 'presigned',
      };
    }
    return {
      kind: 'json',
      body,
      cache: body.cache ?? cache,
      generation: body.generation ?? generation,
      densify: body.densifyStage ?? densify,
    };
  }

  const blob = await res.blob();
  return {
    kind: 'png',
    blob,
    cache,
    generation,
    densify,
    delivery: 'inline',
  };
}
