import { expect } from 'vitest';
import type { RenderGlanceOptions } from '../../packages/api/src/services/glance-render.ts';
import { asBlobStore } from './test-blob-store.ts';
import { createMemoryStores } from './test-services.ts';

/** Minimal valid PNG for sharp resize-safe stubs. */
export const TEST_CARD_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export const glanceRenderOptions: Pick<
  RenderGlanceOptions,
  'fastPng' | 'imageLoader'
> & { skipArtEnrichment: true } = {
  skipArtEnrichment: true,
  fastPng: true,
  imageLoader: async () => new Uint8Array(TEST_CARD_IMAGE),
};

/** Memory services + glance render options with an in-memory blob store. */
export function withGlanceBlobStore() {
  const stores = createMemoryStores();
  return {
    ...stores,
    renderOptions: {
      ...glanceRenderOptions,
      blobStore: asBlobStore(stores.s3),
    },
  };
}

type ApiResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
};

export function glanceErrorCode(res: ApiResult): string | undefined {
  try {
    return JSON.parse(String(res.body)).code;
  } catch {
    return undefined;
  }
}

/** Assert first-call PNG miss headers (optional generation version). */
export function expectPngMiss(res: ApiResult, generation?: string) {
  expect(res.statusCode).toBe(200);
  expect(res.headers?.['content-type']).toBe('image/png');
  expect(res.headers?.['x-glance-cache']).toBe('MISS');
  expect(res.isBase64Encoded).toBe(true);
  if (generation != null) {
    expect(res.headers?.['x-glance-generation']).toBe(generation);
  }
}

/** Assert second-call cache HIT and identical body to prior response. */
export function expectCacheHit(res: ApiResult, prior: ApiResult) {
  expect(res.statusCode).toBe(200);
  expect(res.headers?.['x-glance-cache']).toBe('HIT');
  expect(res.body).toBe(prior.body);
}
