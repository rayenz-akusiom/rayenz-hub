import type { SwapGlanceMode, SwapGlanceRequestItem } from '@rayenz-hub/shared';

export type SwapsGlanceResult = {
  blob: Blob;
  cache: string | null;
  generation: string | null;
  delivery: 'inline' | 'presigned';
};

export type SwapsGlanceRequest = {
  mode: SwapGlanceMode;
  includeSeeking: boolean;
  /** Active set-filter codes for the plate footer (uppercase). */
  setCodes?: string[];
  items: SwapGlanceRequestItem[];
};

export async function apiPostSwapsGlance(
  request: SwapsGlanceRequest,
): Promise<SwapsGlanceResult> {
  const { getHubApiConfig, assertApiNotPageOrigin } = await import('../api/hub-api-client');
  const cfg = getHubApiConfig();
  if (!cfg.enabled) {
    throw new Error(
      'Hub API not configured. Set rayenz-hub-api-url and rayenz-hub-api-key in localStorage.',
    );
  }
  assertApiNotPageOrigin(cfg.url);
  const res = await fetch(`${cfg.url}/v1/swaps/glance`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
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

  const cache = res.headers.get('x-glance-cache');
  const generation = res.headers.get('x-glance-generation');
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = (await res.json()) as {
      delivery?: string;
      url?: string;
      cache?: string;
      generation?: string;
    };
    if (body.delivery === 'presigned' && body.url) {
      const imageRes = await fetch(body.url);
      if (!imageRes.ok) {
        throw new Error(`Failed to fetch swaps glance image (${imageRes.status}).`);
      }
      const blob = await imageRes.blob();
      return {
        blob,
        cache: body.cache ?? null,
        generation: body.generation ?? null,
        delivery: 'presigned',
      };
    }
    throw new Error('Unexpected swaps glance API response.');
  }

  const blob = await res.blob();
  return {
    blob,
    cache,
    generation,
    delivery: 'inline',
  };
}
