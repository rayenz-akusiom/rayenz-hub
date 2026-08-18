import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ratePk } from '@rayenz-hub/shared';
import { TooManyRequestsError } from '../lib/auth.js';

type DocClient = Pick<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient, 'send'>;

export const RATE_LIMITS = {
  signin: { limit: 20, windowMs: 15 * 60 * 1000 },
  register: { limit: 10, windowMs: 15 * 60 * 1000 },
  invite: { limit: 30, windowMs: 24 * 60 * 60 * 1000 },
  publicDeck: { limit: 60, windowMs: 15 * 60 * 1000 },
  publicSwaps: { limit: 20, windowMs: 15 * 60 * 1000 },
} as const;

export type RateKind = keyof typeof RATE_LIMITS;

export class RateLimitService {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
  ) {}

  async consume(kind: RateKind, bucketKey: string): Promise<void> {
    const { limit, windowMs } = RATE_LIMITS[kind];
    const pk = ratePk(`${kind}:${bucketKey}`);
    const sk = 'COUNTER';
    const now = Date.now();
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
      }),
    );
    const item = result.Item;
    let count = 1;
    let windowStart = now;
    if (item) {
      const prevStart = Number(item.windowStart ?? 0);
      const prevCount = Number(item.count ?? 0);
      if (now - prevStart < windowMs) {
        windowStart = prevStart;
        count = prevCount + 1;
      }
    }
    if (count > limit) {
      throw new TooManyRequestsError();
    }
    const expiresAt = Math.floor((windowStart + windowMs) / 1000);
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: pk,
          SK: sk,
          entityType: 'RATE',
          count,
          windowStart,
          expiresAt,
          updatedAt: new Date(now).toISOString(),
        },
      }),
    );
  }
}

export function clientIp(headers: Record<string, string | undefined>): string {
  const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  if (forwarded) {
    return forwarded.split(',')[0].trim() || 'unknown';
  }
  return headers['x-real-ip'] || 'unknown';
}
