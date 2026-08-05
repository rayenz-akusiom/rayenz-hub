import {
  GLANCE_INLINE_MAX_BYTES,
  GlanceCacheRepository,
  glanceCacheKey,
} from '../repositories/glance-cache.js';
import {
  createGlanceImageLoader,
  enrichGlancePlanArt,
  prefetchGlanceImages,
  type GlanceDeckCardRef,
} from '../services/glance-art.js';
import type { GlanceImageLoader, RenderGlanceOptions } from '../services/glance-render.js';
import type { ApiEnv } from '../lib/auth.js';
import type { BlobStore } from '../repositories/s3-blob-store.js';
import { createS3Client, S3BlobStore } from '../repositories/s3-blob-store.js';
import { jsonResponse } from '../lib/response.js';

export type GlanceHandlerOptions = RenderGlanceOptions & {
  blobStore?: BlobStore;
  fetchImpl?: typeof fetch;
  skipArtEnrichment?: boolean;
  inlineMaxBytes?: number;
  presignGet?: (
    generationVersion: string,
    fingerprint: string,
  ) => Promise<{ url: string; expiresAt: string }>;
};

export type GlanceCacheBootstrap = {
  cache: GlanceCacheRepository;
  fetchImpl: typeof fetch;
  inlineMaxBytes: number;
};

/** Build GlanceCacheRepository from handler options + env (lazy S3 client). */
export function createGlanceCacheFromOptions(
  env: ApiEnv,
  options: GlanceHandlerOptions,
  keyFn: (generationVersion: string, fingerprint: string) => string = glanceCacheKey,
): GlanceCacheBootstrap {
  const bucket = env.HUB_BUCKET_NAME || 'rayenz-hub-data-local';
  const s3Client = createS3Client(env);
  const blob = options.blobStore ?? new S3BlobStore(s3Client, bucket);
  const cache = new GlanceCacheRepository(blob, { client: s3Client, bucket }, keyFn);
  return {
    cache,
    fetchImpl: options.fetchImpl ?? fetch,
    inlineMaxBytes: options.inlineMaxBytes ?? GLANCE_INLINE_MAX_BYTES,
  };
}

export type RenderPlanThroughCacheArgs<TPlan extends { fingerprint: string; placements: Array<{ card: { instanceId: string; imageUrl: string | null } }> }> = {
  generationVersion: string;
  plan: TPlan;
  cards: GlanceDeckCardRef[];
  cache: GlanceCacheRepository;
  options: GlanceHandlerOptions;
  fetchImpl: typeof fetch;
  render: (plan: TPlan, opts: { imageLoader: GlanceImageLoader; fastPng?: boolean }) => Promise<Uint8Array>;
  /** When set, reuse/merge into this map across multi-page renders. */
  sharedImageCache?: Map<string, Uint8Array> | null;
};

export type RenderPlanThroughCacheResult = {
  png: Uint8Array;
  cacheStatus: 'HIT' | 'MISS';
  imageCache: Map<string, Uint8Array>;
};

/** Cache get-or-miss: enrich → prefetch → render → put. */
export async function renderPlanThroughCache<
  TPlan extends { fingerprint: string; placements: Array<{ card: { instanceId: string; imageUrl: string | null } }> },
>(args: RenderPlanThroughCacheArgs<TPlan>): Promise<RenderPlanThroughCacheResult> {
  const { generationVersion, plan, cards, cache, options, fetchImpl, render } = args;
  let png = await cache.get(generationVersion, plan.fingerprint);
  let cacheStatus: 'HIT' | 'MISS' = 'HIT';
  let imageCache = args.sharedImageCache ?? null;

  if (!png) {
    cacheStatus = 'MISS';
    const renderPlan = options.skipArtEnrichment
      ? plan
      : await enrichGlancePlanArt(plan, cards, fetchImpl);
    if (!imageCache) {
      imageCache = await prefetchGlanceImages(renderPlan, fetchImpl);
    } else {
      const extra = await prefetchGlanceImages(renderPlan, fetchImpl);
      for (const [k, v] of extra) imageCache.set(k, v);
    }
    const imageLoader = options.imageLoader ?? createGlanceImageLoader(imageCache, fetchImpl);
    png = await render(renderPlan, {
      imageLoader,
      fastPng: options.fastPng,
    });
    await cache.put(generationVersion, plan.fingerprint, png);
  }

  return {
    png,
    cacheStatus,
    imageCache: imageCache ?? new Map(),
  };
}

/** JSON body when PNG exceeds inline size limit. */
export async function glancePresignedDeliveryResponse(
  generationVersion: string,
  fingerprint: string,
  cacheStatus: 'HIT' | 'MISS',
  cache: GlanceCacheRepository,
  options: GlanceHandlerOptions,
  extra: Record<string, unknown> = {},
) {
  const presigned = options.presignGet
    ? await options.presignGet(generationVersion, fingerprint)
    : await cache.presignGet(generationVersion, fingerprint);
  return jsonResponse(200, {
    delivery: 'presigned',
    url: presigned.url,
    expiresAt: presigned.expiresAt,
    generation: generationVersion,
    cache: cacheStatus,
    ...extra,
  });
}
