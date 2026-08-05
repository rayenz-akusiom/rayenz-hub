import type { SwapGlanceMode, SwapGlanceRequestItem } from '@rayenz-hub/shared';
import {
  base64ToBlob,
  fetchImageBlob,
  postGlanceRequest,
  resolveInlineOrPresignedPng,
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
  const resolved = await resolveInlineOrPresignedPng(res, 'swaps glance');

  if (resolved.kind === 'png') {
    return {
      blobs: [resolved.blob],
      pageCount: 1,
      densifyStage: resolved.densify,
      omittedCardCount: 0,
      cache: resolved.cache,
      generation: resolved.generation,
      delivery: resolved.delivery,
    };
  }

  const { body, cache, generation, densify } = resolved;
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
      densifyStage: body.densifyStage ?? densify,
      omittedCardCount: body.omittedCardCount ?? 0,
      cache: body.cache ?? cache,
      generation: body.generation ?? generation,
      delivery: 'bundle',
    };
  }

  throw new Error('Unexpected swaps glance API response.');
}
