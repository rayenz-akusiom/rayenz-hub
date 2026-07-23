import {
  buildGlanceIncludeSet,
  buildGlanceLayoutPlan,
  GLANCE_GENERATION_VERSION,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { binaryResponse, errorResponse, jsonResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { getAppServices, type AppServices } from '../ioc/index.js';
import {
  GLANCE_INLINE_MAX_BYTES,
  GlanceCacheRepository,
} from '../repositories/glance-cache.js';
import {
  createGlanceImageLoader,
  enrichGlancePlanArt,
  prefetchGlanceImages,
} from '../services/glance-art.js';
import { renderGlancePng, type RenderGlanceOptions } from '../services/glance-render.js';
import type { BlobStore } from '../repositories/s3-blob-store.js';
import { createS3Client, S3BlobStore } from '../repositories/s3-blob-store.js';

function safeFilename(name: string): string {
  return String(name || 'deck')
    .replace(/[^\w\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'deck';
}

export type DeckGlanceOptions = RenderGlanceOptions & {
  blobStore?: BlobStore;
  fetchImpl?: typeof fetch;
  skipArtEnrichment?: boolean;
  inlineMaxBytes?: number;
  presignGet?: (
    generationVersion: string,
    fingerprint: string,
  ) => Promise<{ url: string; expiresAt: string }>;
};

export async function handleDeckGlance(
  deckId: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
  options: DeckGlanceOptions = {},
) {
  try {
    const { auth, env } = services.authService.authenticate(headers);
    const record = await services.deckRepository.get(auth, env, deckId);
    if (!record) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }

    const deck = record as DeckDocument;
    if (deck.format !== 'commander') {
      return errorResponse(400, 'Glance is supported for Commander decks only.', 'GLANCE_UNSUPPORTED_FORMAT');
    }

    const includeResult = buildGlanceIncludeSet(deck);
    if (!includeResult.ok) {
      return errorResponse(400, includeResult.message, includeResult.code);
    }

    const plan = buildGlanceLayoutPlan(includeResult.includeSet, deck.name || null);
    const bucket = env.HUB_BUCKET_NAME || 'rayenz-hub-data-local';
    const s3Client = createS3Client(env);
    const blob =
      options.blobStore ?? new S3BlobStore(s3Client, bucket);
    const cache = new GlanceCacheRepository(blob, { client: s3Client, bucket });
    const fetchImpl = options.fetchImpl ?? fetch;
    const inlineMaxBytes = options.inlineMaxBytes ?? GLANCE_INLINE_MAX_BYTES;

    let png = await cache.get(GLANCE_GENERATION_VERSION, plan.fingerprint);
    let cacheStatus: 'HIT' | 'MISS' = 'HIT';
    if (!png) {
      cacheStatus = 'MISS';
      const renderPlan = options.skipArtEnrichment
        ? plan
        : await enrichGlancePlanArt(plan, deck.cards || [], fetchImpl);
      const imageCache = await prefetchGlanceImages(renderPlan, fetchImpl);
      const imageLoader = options.imageLoader ?? createGlanceImageLoader(imageCache, fetchImpl);
      png = await renderGlancePng(renderPlan, { imageLoader });
      await cache.put(GLANCE_GENERATION_VERSION, plan.fingerprint, png);
    }

    if (png.byteLength > inlineMaxBytes) {
      const presigned = options.presignGet
        ? await options.presignGet(GLANCE_GENERATION_VERSION, plan.fingerprint)
        : await cache.presignGet(GLANCE_GENERATION_VERSION, plan.fingerprint);
      return jsonResponse(200, {
        delivery: 'presigned',
        url: presigned.url,
        expiresAt: presigned.expiresAt,
        generation: GLANCE_GENERATION_VERSION,
        cache: cacheStatus,
      });
    }

    const filename = `${safeFilename(deck.name)}-glance.png`;
    return binaryResponse(200, png, {
      'content-type': 'image/png',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-glance-cache': cacheStatus,
      'x-glance-generation': GLANCE_GENERATION_VERSION,
    });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}
