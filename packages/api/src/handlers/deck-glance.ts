import {
  buildGlanceIncludeSet,
  buildGlanceLayoutPlan,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { binaryResponse, errorResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { getAppServices, type AppServices } from '../ioc/index.js';
import { GlanceCacheRepository } from '../repositories/glance-cache.js';
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
    const blob =
      options.blobStore ??
      new S3BlobStore(createS3Client(env), env.HUB_BUCKET_NAME || 'rayenz-hub-data-local');
    const cache = new GlanceCacheRepository(blob);
    const fetchImpl = options.fetchImpl ?? fetch;

    let png = await cache.get(plan.layoutVersion, plan.fingerprint);
    let cacheStatus: 'HIT' | 'MISS' = 'HIT';
    if (!png) {
      cacheStatus = 'MISS';
      const renderPlan = options.skipArtEnrichment
        ? plan
        : await enrichGlancePlanArt(plan, deck.cards || [], fetchImpl);
      const imageCache = await prefetchGlanceImages(renderPlan, fetchImpl);
      const imageLoader = options.imageLoader ?? createGlanceImageLoader(imageCache, fetchImpl);
      png = await renderGlancePng(renderPlan, { imageLoader });
      await cache.put(plan.layoutVersion, plan.fingerprint, png);
    }

    const filename = `${safeFilename(deck.name)}-glance.png`;
    return binaryResponse(200, png, {
      'content-type': 'image/png',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-glance-cache': cacheStatus,
    });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}
