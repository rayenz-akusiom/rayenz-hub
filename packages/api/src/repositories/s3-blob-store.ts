import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { ApiEnv } from '../lib/auth.js';

export function createS3Client(env: ApiEnv): S3Client {
  const config: ConstructorParameters<typeof S3Client>[0] = {
    region: env.AWS_REGION || 'us-east-1',
  };
  if (env.S3_ENDPOINT) {
    config.endpoint = env.S3_ENDPOINT;
    config.forcePathStyle = true;
    config.credentials = { accessKeyId: 'local', secretAccessKey: 'localpass1' };
  }
  return new S3Client(config);
}

export interface BlobStore {
  getText(key: string): Promise<string | null>;
  putText(key: string, body: string, contentType: string): Promise<void>;
  getBytes?(key: string): Promise<Uint8Array | null>;
  putBytes?(key: string, body: Uint8Array, contentType: string): Promise<void>;
  deleteObject?(key: string): Promise<void>;
}

export class S3BlobStore implements BlobStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async getText(key: string): Promise<string | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return result.Body ? await result.Body.transformToString() : null;
    } catch (e) {
      if (isNotFound(e)) {
        return null;
      }
      throw e;
    }
  }

  async putText(key: string, body: string, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getBytes(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) return null;
      return new Uint8Array(await result.Body.transformToByteArray());
    } catch (e) {
      if (isNotFound(e)) {
        return null;
      }
      throw e;
    }
  }

  async putBytes(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'NoSuchKey';
}
