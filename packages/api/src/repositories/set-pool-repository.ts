import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  INLINE_SET_POOL_MAX_BYTES,
  resolveUserId,
  setPoolSk,
  SYSTEM_PK,
  systemSetPoolS3Key,
  userPk,
  userSetPoolS3Key,
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
  poolKind?: 'release' | 'upgrade';
  deckId?: string;
  budgetUsd?: number;
  focusTags?: string[];
}

export class SetPoolRepository {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
    private readonly s3: BlobStore,
  ) {}

  async get(auth: AuthContext, env: ApiEnv, codesKey: string): Promise<SetPoolRecord | null> {
    const userId = resolveUserId(auth, env);
    return this.getForPk(userPk(userId), codesKey);
  }

  async getSystem(codesKey: string): Promise<SetPoolRecord | null> {
    return this.getForPk(SYSTEM_PK, codesKey);
  }

  async put(auth: AuthContext, env: ApiEnv, codesKey: string, input: SetPoolUpsert): Promise<SetPoolRecord> {
    const userId = resolveUserId(auth, env);
    return this.putForPk(userPk(userId), codesKey, input, userSetPoolS3Key(userId, codesKey));
  }

  async putSystem(codesKey: string, input: SetPoolUpsert): Promise<SetPoolRecord> {
    return this.putForPk(SYSTEM_PK, codesKey, input, systemSetPoolS3Key(codesKey));
  }

  private async getForPk(pk: string, codesKey: string): Promise<SetPoolRecord | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: setPoolSk(codesKey) },
      }),
    );
    if (!result.Item) {
      return null;
    }
    return mapItem(codesKey, result.Item, await loadCards(result.Item, this.s3));
  }

  private async putForPk(
    pk: string,
    codesKey: string,
    input: SetPoolUpsert,
    s3Key: string,
  ): Promise<SetPoolRecord> {
    const now = new Date().toISOString();
    const cards = input.cards ?? [];
    const cardsJson = JSON.stringify(cards);
    const useS3 = Buffer.byteLength(cardsJson, 'utf8') > INLINE_SET_POOL_MAX_BYTES;
    const item: Record<string, unknown> = {
      PK: pk,
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
      await this.s3.putText(
        s3Key,
        JSON.stringify({ codes: input.codes, cards, complete: input.complete }),
        'application/json',
      );
    } else {
      item.payload = { cards };
    }
    if (input.poolKind) item.poolKind = input.poolKind;
    if (input.deckId) item.deckId = input.deckId;
    if (input.budgetUsd != null) item.budgetUsd = input.budgetUsd;
    if (input.focusTags?.length) item.focusTags = input.focusTags;
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
      poolKind: input.poolKind,
      deckId: input.deckId,
      budgetUsd: input.budgetUsd,
      focusTags: input.focusTags,
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
    poolKind: item.poolKind === 'upgrade' || item.poolKind === 'release' ? item.poolKind : undefined,
    deckId: item.deckId ? String(item.deckId) : undefined,
    budgetUsd: item.budgetUsd != null ? Number(item.budgetUsd) : undefined,
    focusTags: Array.isArray(item.focusTags) ? (item.focusTags as string[]) : undefined,
  };
}
