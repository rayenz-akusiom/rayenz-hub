import type { SwapGlanceMode, SwapGlanceRequestItem } from '@rayenz-hub/shared';

export type SwapsGlanceResult = {
  blobs: Blob[];
  pageCount: number;
  densifyStage: string | null;
  omittedCardCount: number;
  cache: string | null;
  generation: string | null;
  delivery: 'inline' | 'presigned' | 'bundle';
};

export type SwapsGlanceRequest = {
  mode: SwapGlanceMode;
  includeSeeking: boolean;
  /** Active set-filter codes for the plate footer (uppercase). */
  setCodes?: string[];
  items: SwapGlanceRequestItem[];
};

function base64ToBlob(b64: string, type = 'image/png'): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const imageRes = await fetch(url);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch swaps glance image (${imageRes.status}).`);
  }
  return imageRes.blob();
}

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
  const densifyHeader = res.headers.get('x-glance-densify');
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = (await res.json()) as {
      delivery?: string;
      url?: string;
      cache?: string;
      generation?: string;
      pageCount?: number;
      densifyStage?: string;
      omittedCardCount?: number;
      images?: Array<{
        index?: number;
        delivery?: string;
        url?: string;
        pngBase64?: string;
        cache?: string;
      }>;
    };

    if (body.delivery === 'bundle' && Array.isArray(body.images)) {
      const sorted = [...body.images].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const blobs: Blob[] = [];
      for (const img of sorted) {
        if (img.delivery === 'presigned' && img.url) {
          blobs.push(await fetchImageBlob(img.url));
        } else if (img.delivery === 'inline' && img.pngBase64) {
          blobs.push(base64ToBlob(img.pngBase64));
        } else {
          throw new Error('Unexpected swaps glance bundle image entry.');
        }
      }
      if (!blobs.length) {
        throw new Error('Swaps glance bundle contained no images.');
      }
      return {
        blobs,
        pageCount: body.pageCount ?? blobs.length,
        densifyStage: body.densifyStage ?? null,
        omittedCardCount: body.omittedCardCount ?? 0,
        cache: body.cache ?? null,
        generation: body.generation ?? null,
        delivery: 'bundle',
      };
    }

    if (body.delivery === 'presigned' && body.url) {
      const blob = await fetchImageBlob(body.url);
      return {
        blobs: [blob],
        pageCount: 1,
        densifyStage: body.densifyStage ?? densifyHeader,
        omittedCardCount: body.omittedCardCount ?? 0,
        cache: body.cache ?? null,
        generation: body.generation ?? null,
        delivery: 'presigned',
      };
    }
    throw new Error('Unexpected swaps glance API response.');
  }

  const blob = await res.blob();
  return {
    blobs: [blob],
    pageCount: 1,
    densifyStage: densifyHeader,
    omittedCardCount: 0,
    cache,
    generation,
    delivery: 'inline',
  };
}
