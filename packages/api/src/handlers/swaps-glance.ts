import {
  buildSwapGlanceIncludeSet,
  buildSwapGlanceLayoutPlan,
  SWAP_GLANCE_GENERATION_VERSION,
  type DeckDocument,
  type SwapGlanceMode,
  type SwapGlanceRequestItem,
  type WantSourceKind,
} from '@rayenz-hub/shared';
import { binaryResponse, errorResponse, jsonResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { getAppServices, type AppServices } from '../ioc/index.js';
import {
  GLANCE_INLINE_MAX_BYTES,
  GlanceCacheRepository,
  swapGlanceCacheKey,
} from '../repositories/glance-cache.js';
import {
  createGlanceImageLoader,
  enrichSwapGlancePlanArt,
  prefetchSwapGlanceImages,
} from '../services/glance-art.js';
import { renderSwapGlancePng, type RenderGlanceOptions } from '../services/glance-render.js';
import type { BlobStore } from '../repositories/s3-blob-store.js';
import { createS3Client, S3BlobStore } from '../repositories/s3-blob-store.js';

export type SwapsGlanceOptions = RenderGlanceOptions & {
  blobStore?: BlobStore;
  fetchImpl?: typeof fetch;
  skipArtEnrichment?: boolean;
  inlineMaxBytes?: number;
  presignGet?: (
    generationVersion: string,
    fingerprint: string,
  ) => Promise<{ url: string; expiresAt: string }>;
};

const KINDS = new Set<WantSourceKind>(['seeking', 'queued_in', 'queued_out']);
const MODES = new Set<SwapGlanceMode>(['full', 'in_only']);

function parseSwapsGlanceRequest(body: string | null | undefined):
  | {
      ok: true;
      mode: SwapGlanceMode;
      includeSeeking: boolean;
      items: SwapGlanceRequestItem[];
    }
  | { ok: false; message: string } {
  if (!body) {
    return { ok: false, message: 'Request body is required' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, message: 'Invalid JSON body' };
  }
  if (parsed == null || typeof parsed !== 'object') {
    return { ok: false, message: 'Invalid request body' };
  }
  const raw = parsed as {
    mode?: unknown;
    includeSeeking?: unknown;
    items?: unknown;
  };
  if (raw.mode !== 'full' && raw.mode !== 'in_only') {
    return { ok: false, message: 'mode must be "full" or "in_only"' };
  }
  if (typeof raw.includeSeeking !== 'boolean') {
    return { ok: false, message: 'includeSeeking must be a boolean' };
  }
  if (!Array.isArray(raw.items)) {
    return { ok: false, message: 'items must be an array' };
  }
  const items: SwapGlanceRequestItem[] = [];
  for (const entry of raw.items) {
    if (entry == null || typeof entry !== 'object') {
      return { ok: false, message: 'Each item must be an object' };
    }
    const item = entry as { deckId?: unknown; kind?: unknown; entryId?: unknown };
    if (typeof item.deckId !== 'string' || !item.deckId) {
      return { ok: false, message: 'item.deckId is required' };
    }
    if (typeof item.entryId !== 'string' || !item.entryId) {
      return { ok: false, message: 'item.entryId is required' };
    }
    if (typeof item.kind !== 'string' || !KINDS.has(item.kind as WantSourceKind)) {
      return { ok: false, message: 'item.kind must be seeking, queued_in, or queued_out' };
    }
    items.push({
      deckId: item.deckId,
      kind: item.kind as WantSourceKind,
      entryId: item.entryId,
    });
  }
  if (!MODES.has(raw.mode)) {
    return { ok: false, message: 'Invalid mode' };
  }
  return {
    ok: true,
    mode: raw.mode,
    includeSeeking: raw.includeSeeking,
    items,
  };
}

export async function handleSwapsGlance(
  headers: Record<string, string | undefined>,
  body: string | null | undefined = null,
  services: AppServices = getAppServices(),
  options: SwapsGlanceOptions = {},
) {
  try {
    const { auth, env } = services.authService.authenticate(headers);
    const request = parseSwapsGlanceRequest(body);
    if (!request.ok) {
      return errorResponse(400, request.message, 'BAD_REQUEST');
    }

    const deckIds = [...new Set(request.items.map((i) => i.deckId))];
    const decks: DeckDocument[] = [];
    for (const deckId of deckIds) {
      const record = await services.deckRepository.get(auth, env, deckId);
      if (!record) {
        return errorResponse(404, `Deck not found: ${deckId}`, 'NOT_FOUND');
      }
      decks.push(record as DeckDocument);
    }

    const includeResult = buildSwapGlanceIncludeSet(decks, request.items, {
      mode: request.mode,
      includeSeeking: request.includeSeeking,
    });
    if (!includeResult.ok) {
      return errorResponse(400, includeResult.message, includeResult.code);
    }

    const plan = buildSwapGlanceLayoutPlan(includeResult.includeSet);
    const bucket = env.HUB_BUCKET_NAME || 'rayenz-hub-data-local';
    const s3Client = createS3Client(env);
    const blob = options.blobStore ?? new S3BlobStore(s3Client, bucket);
    const cache = new GlanceCacheRepository(
      blob,
      { client: s3Client, bucket },
      swapGlanceCacheKey,
    );
    const fetchImpl = options.fetchImpl ?? fetch;
    const inlineMaxBytes = options.inlineMaxBytes ?? GLANCE_INLINE_MAX_BYTES;

    let png = await cache.get(SWAP_GLANCE_GENERATION_VERSION, plan.fingerprint);
    let cacheStatus: 'HIT' | 'MISS' = 'HIT';
    if (!png) {
      cacheStatus = 'MISS';
      const allCards = decks.flatMap((d) => d.cards || []);
      const renderPlan = options.skipArtEnrichment
        ? plan
        : await enrichSwapGlancePlanArt(plan, allCards, fetchImpl);
      const imageCache = await prefetchSwapGlanceImages(renderPlan, fetchImpl);
      const imageLoader = options.imageLoader ?? createGlanceImageLoader(imageCache, fetchImpl);
      png = await renderSwapGlancePng(renderPlan, { imageLoader });
      await cache.put(SWAP_GLANCE_GENERATION_VERSION, plan.fingerprint, png);
    }

    if (png.byteLength > inlineMaxBytes) {
      const presigned = options.presignGet
        ? await options.presignGet(SWAP_GLANCE_GENERATION_VERSION, plan.fingerprint)
        : await cache.presignGet(SWAP_GLANCE_GENERATION_VERSION, plan.fingerprint);
      return jsonResponse(200, {
        delivery: 'presigned',
        url: presigned.url,
        expiresAt: presigned.expiresAt,
        generation: SWAP_GLANCE_GENERATION_VERSION,
        cache: cacheStatus,
      });
    }

    return binaryResponse(200, png, {
      'content-type': 'image/png',
      'content-disposition': 'attachment; filename="swaps-at-a-glance.png"',
      'x-glance-cache': cacheStatus,
      'x-glance-generation': SWAP_GLANCE_GENERATION_VERSION,
    });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}
