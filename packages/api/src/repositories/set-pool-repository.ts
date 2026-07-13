import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  INLINE_SET_POOL_MAX_BYTES,
  resolveUserId,
  setPoolSk,
  userPk,
  type AuthContext,
  type SetPoolUpsert,
} from '@rayenz-hub/shared';
import type { ApiEnv } from '../lib/auth.js';
import type { BlobStore } from './s3-blob-store.js';

type DocClient = Pick<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient, 'send'>;

export interface SetPoolRecord {
  codesKey: string;
  codes: string[];
  complete: boolean;
  primaryCode?: string;
  setName?: string;
  cards: Record<string, unknown>[];
  formatVersion: number;
  updatedAt: string;
}

export class SetPoolRepository {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
    private readonly s3: BlobStore,
  ) {}

  async get(auth: AuthContext, env: ApiEnv, codesKey: string): Promise<SetPoolRecord | null> {
    const userId = resolveUserId(auth, env);
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: setPoolSk(codesKey) },
      }),
    );
    if (!result.Item) {
      return null;
    }
    return mapItem(codesKey, result.Item, await loadCards(result.Item, this.s3));
  }

  async put(auth: AuthContext, env: ApiEnv, codesKey: string, input: SetPoolUpsert): Promise<SetPoolRecord> {
    const userId = resolveUserId(auth, env);
    const now = new Date().toISOString();
    const cards = input.cards ?? [];
    const cardsJson = JSON.stringify(cards);
    const useS3 = Buffer.byteLength(cardsJson, 'utf8') > INLINE_SET_POOL_MAX_BYTES;
    const s3Key = `set-pools/${codesKey}.json`;
    const item: Record<string, unknown> = {
      PK: userPk(userId),
      SK: setPoolSk(codesKey),
      entityType: 'SET_POOL',
      codesKey,
      codes: input.codes,
      complete: input.complete,
      primaryCode: input.primaryCode,
      setName: input.setName,
      cardCount: cards.length,
      formatVersion: input.formatVersion ?? 1,
      inlineCards: !useS3,
      updatedAt: now,
      createdAt: now,
    };
    if (useS3) {
      item.s3Key = s3Key;
      await this.s3.putText(s3Key, JSON.stringify({ codes: input.codes, cards, complete: input.complete }), 'application/json');
    } else {
      item.payload = { cards };
    }
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return {
      codesKey,
      codes: input.codes,
      complete: input.complete,
      primaryCode: input.primaryCode,
      setName: input.setName,
      cards,
      formatVersion: Number(item.formatVersion),
      updatedAt: now,
    };
  }
}

async function loadCards(item: Record<string, unknown>, s3: BlobStore): Promise<Record<string, unknown>[]> {
  if (item.inlineCards && item.payload && typeof item.payload === 'object') {
    return ((item.payload as { cards?: Record<string, unknown>[] }).cards) || [];
  }
  const s3Key = item.s3Key as string | undefined;
  if (!s3Key) {
    return [];
  }
  const raw = await s3.getText(s3Key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as { cards?: Record<string, unknown>[] };
    return parsed.cards || [];
  } catch {
    return [];
  }
}

function mapItem(
  codesKey: string,
  item: Record<string, unknown>,
  cards: Record<string, unknown>[],
): SetPoolRecord {
  return {
    codesKey,
    codes: (item.codes as string[]) || [],
    complete: Boolean(item.complete),
    primaryCode: item.primaryCode ? String(item.primaryCode) : undefined,
    setName: item.setName ? String(item.setName) : undefined,
    cards,
    formatVersion: Number(item.formatVersion ?? 1),
    updatedAt: String(item.updatedAt ?? ''),
  };
}
