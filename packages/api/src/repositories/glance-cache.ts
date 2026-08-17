import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Client } from '@aws-sdk/client-s3';
import type { BlobStore } from './s3-blob-store.js';
import { userGlanceCacheKey, userSwapGlanceCacheKey } from '@rayenz-hub/shared';

/** Raw PNG bytes above this use presigned S3 delivery (Lambda 6 MB response cap). */
export const GLANCE_INLINE_MAX_BYTES = 4 * 1024 * 1024;

const DEFAULT_PRESIGN_SECONDS = 15 * 60;

export function glanceCacheKey(generationVersion: string, fingerprint: string, userId = '_shared'): string {
  return userGlanceCacheKey(userId, generationVersion, fingerprint);
}

export function swapGlanceCacheKey(generationVersion: string, fingerprint: string, userId = '_shared'): string {
  return userSwapGlanceCacheKey(userId, generationVersion, fingerprint);
}

export class GlanceCacheRepository {
  private readonly keyFn: (generationVersion: string, fingerprint: string) => string;

  constructor(
    private readonly blob: BlobStore,
    private readonly presign?: {
      client: S3Client;
      bucket: string;
    },
    keyFn: (generationVersion: string, fingerprint: string) => string = glanceCacheKey,
  ) {
    this.keyFn = keyFn;
  }

  async get(generationVersion: string, fingerprint: string): Promise<Uint8Array | null> {
    if (!this.blob.getBytes) return null;
    return this.blob.getBytes(this.keyFn(generationVersion, fingerprint));
  }

  async put(generationVersion: string, fingerprint: string, png: Uint8Array): Promise<void> {
    if (!this.blob.putBytes) return;
    await this.blob.putBytes(
      this.keyFn(generationVersion, fingerprint),
      png,
      'image/png',
    );
  }

  async presignGet(
    generationVersion: string,
    fingerprint: string,
    expiresInSeconds = DEFAULT_PRESIGN_SECONDS,
  ): Promise<{ url: string; expiresAt: string }> {
    if (!this.presign) {
      throw new Error('Presigned glance URLs require S3 configuration.');
    }
    const key = this.keyFn(generationVersion, fingerprint);
    const command = new GetObjectCommand({
      Bucket: this.presign.bucket,
      Key: key,
    });
    const url = await getSignedUrl(this.presign.client, command, { expiresIn: expiresInSeconds });
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    return { url, expiresAt };
  }
}
