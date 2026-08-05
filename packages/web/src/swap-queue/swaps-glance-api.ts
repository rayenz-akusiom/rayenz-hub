import type { SwapGlanceMode, SwapGlanceRequestItem } from '@rayenz-hub/shared';
import {
  base64ToBlob,
  fetchImageBlob,
  glanceResponseMeta,
  postGlanceRequest,
} from '../lib/glance-http';

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

export async function apiPostSwapsGlance(
  request: SwapsGlanceRequest,
): Promise<SwapsGlanceResult> {
  const res = await postGlanceRequest('/v1/swaps/glance', request);
  const { cache, generation, densify: densifyHeader, contentType } = glanceResponseMeta(res);

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
          blobs.push(await fetchImageBlob(img.url, 'swaps glance'));
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
      const blob = await fetchImageBlob(body.url, 'swaps glance');
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
