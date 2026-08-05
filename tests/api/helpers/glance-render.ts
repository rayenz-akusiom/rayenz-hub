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
