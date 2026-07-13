import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  resolveUserId,
  reviewSk,
  userPk,
  type AuthContext,
  type ReviewProgressUpsert,
} from '@rayenz-hub/shared';
import type { ApiEnv } from '../lib/auth.js';

type DocClient = Pick<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient, 'send'>;

export interface ReviewProgressRecord {
  fileId: string;
  formatVersion: number;
  decisions: Record<string, string>;
  currentDeckId: string | null;
  currentSuggestionIndex: Record<string, number>;
  updatedAt: string;
}

export class ReviewProgressRepository {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
  ) {}

  async get(auth: AuthContext, env: ApiEnv, fileId: string): Promise<ReviewProgressRecord | null> {
    const userId = resolveUserId(auth, env);
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: reviewSk(fileId) },
      }),
    );
    if (!result.Item) {
      return null;
    }
    return mapItem(fileId, result.Item);
  }

  async put(
    auth: AuthContext,
    env: ApiEnv,
    fileId: string,
    input: ReviewProgressUpsert,
  ): Promise<ReviewProgressRecord> {
    const userId = resolveUserId(auth, env);
    const now = new Date().toISOString();
    const item = {
      PK: userPk(userId),
      SK: reviewSk(fileId),
      entityType: 'REVIEW',
      fileId,
      formatVersion: input.formatVersion ?? 1,
      decisions: input.decisions,
      currentDeckId: input.currentDeckId ?? null,
      currentSuggestionIndex: input.currentSuggestionIndex ?? {},
      updatedAt: now,
      createdAt: now,
    };
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return mapItem(fileId, item);
  }
}

function mapItem(fileId: string, item: Record<string, unknown>): ReviewProgressRecord {
  return {
    fileId,
    formatVersion: Number(item.formatVersion ?? 1),
    decisions: (item.decisions as Record<string, string>) || {},
    currentDeckId: item.currentDeckId != null ? String(item.currentDeckId) : null,
    currentSuggestionIndex: (item.currentSuggestionIndex as Record<string, number>) || {},
    updatedAt: String(item.updatedAt ?? ''),
  };
}
