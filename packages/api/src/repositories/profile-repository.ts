import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  profileSk,
  resolveUserId,
  userPk,
  type AuthContext,
  type ProfileUpsert,
} from '@rayenz-hub/shared';
import type { ApiEnv } from '../lib/auth.js';
import type { BlobStore } from './s3-blob-store.js';

type DocClient = Pick<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient, 'send'>;

export interface ProfileRecord {
  deckId: string;
  deckName?: string;
  formatVersion: number;
  protectedCards: string[];
  blockedCards: string[];
  tags: string[];
  yaml?: string;
  updatedAt: string;
}

export class ProfileRepository {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
    private readonly s3: BlobStore,
  ) {}

  async list(auth: AuthContext, env: ApiEnv): Promise<ProfileRecord[]> {
    const userId = resolveUserId(auth, env);
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': userPk(userId),
          ':sk': 'PROFILE::',
        },
      }),
    );
    return (result.Items || []).map((item) => mapSummary(item));
  }

  async get(auth: AuthContext, env: ApiEnv, deckId: string): Promise<ProfileRecord | null> {
    const userId = resolveUserId(auth, env);
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: profileSk(deckId) },
      }),
    );
    if (!result.Item) {
      return null;
    }
    const record = mapSummary(result.Item, deckId);
    const s3Key = result.Item.s3Key as string | undefined;
    if (s3Key) {
      record.yaml = (await this.s3.getText(s3Key)) ?? undefined;
    }
    return record;
  }

  async put(auth: AuthContext, env: ApiEnv, deckId: string, input: ProfileUpsert): Promise<ProfileRecord> {
    const userId = resolveUserId(auth, env);
    const now = new Date().toISOString();
    const protectedCards = input.protectedCards ?? [];
    const blockedCards = input.blockedCards ?? [];
    const tags = input.tags ?? [];
    const yaml = input.yaml ?? buildYaml(deckId, input.deckName, protectedCards, blockedCards, tags);
    const s3Key = `profiles/${deckId}.yaml`;
    await this.s3.putText(s3Key, yaml, 'text/yaml');
    const item = {
      PK: userPk(userId),
      SK: profileSk(deckId),
      entityType: 'PROFILE',
      deckId,
      deckName: input.deckName || deckId,
      formatVersion: input.formatVersion ?? 1,
      protectedCards,
      blockedCards,
      tags,
      s3Key,
      byteSize: Buffer.byteLength(yaml, 'utf8'),
      updatedAt: now,
      createdAt: now,
    };
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return {
      deckId,
      deckName: item.deckName,
      formatVersion: item.formatVersion,
      protectedCards,
      blockedCards,
      tags,
      yaml,
      updatedAt: now,
    };
  }
}

function mapSummary(item: Record<string, unknown>, deckId?: string): ProfileRecord {
  return {
    deckId: String(deckId ?? item.deckId ?? ''),
    deckName: item.deckName ? String(item.deckName) : undefined,
    formatVersion: Number(item.formatVersion ?? 1),
    protectedCards: (item.protectedCards as string[]) || [],
    blockedCards: (item.blockedCards as string[]) || [],
    tags: (item.tags as string[]) || [],
    updatedAt: String(item.updatedAt ?? ''),
  };
}

function buildYaml(
  deckId: string,
  deckName: string | undefined,
  protectedCards: string[],
  blockedCards: string[],
  tags: string[],
): string {
  const lines = [
    `deck_id: ${deckId}`,
    deckName ? `deck_name: ${deckName}` : '',
    'protected_cards:',
    ...protectedCards.map((c) => `  - ${c}`),
    'blocked_cards:',
    ...blockedCards.map((c) => `  - ${c}`),
    'tags:',
    ...tags.map((t) => `  - ${t}`),
  ].filter(Boolean);
  return lines.join('\n') + '\n';
}
