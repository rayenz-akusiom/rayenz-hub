import type { BlobStore } from './s3-blob-store.js';

export function glanceCacheKey(layoutVersion: string, fingerprint: string): string {
  return `glance-cache/${layoutVersion}/${fingerprint}.png`;
}

export class GlanceCacheRepository {
  constructor(private readonly blob: BlobStore) {}

  async get(layoutVersion: string, fingerprint: string): Promise<Uint8Array | null> {
    if (!this.blob.getBytes) return null;
    return this.blob.getBytes(glanceCacheKey(layoutVersion, fingerprint));
  }

  async put(layoutVersion: string, fingerprint: string, png: Uint8Array): Promise<void> {
    if (!this.blob.putBytes) return;
    await this.blob.putBytes(glanceCacheKey(layoutVersion, fingerprint), png, 'image/png');
  }
}
