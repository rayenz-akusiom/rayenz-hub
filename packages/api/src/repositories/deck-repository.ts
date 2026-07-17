import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  DeckDocumentSchema,
  deckCoverImageUrl,
  deckCoverImageUrlSecondary,
  pickCoverPartnerStatus,
  deckSk,
  resolveUserId,
  userPk,
  type AuthContext,
  type DeckDocument,
  type DeckSummary,
} from '@rayenz-hub/shared';
import type { ApiEnv } from '../lib/auth.js';
import type { BlobStore } from './s3-blob-store.js';

type DocClient = Pick<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient, 'send'>;

export class DeckRepository {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
    private readonly s3: BlobStore,
  ) {}

  async list(auth: AuthContext, env: ApiEnv): Promise<DeckSummary[]> {
    const userId = resolveUserId(auth, env);
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': userPk(userId),
          ':sk': 'DECK::',
        },
      }),
    );
    return (result.Items || []).map((item) => ({
      deckId: String(item.deckId ?? ''),
      name: String(item.deckName ?? item.deckId ?? ''),
      format: (item.format as DeckSummary['format']) || 'other',
      updatedAt: String(item.updatedAt ?? ''),
      archidektId: item.archidektId != null ? Number(item.archidektId) : null,
      coverImageUrl: item.coverImageUrl != null ? String(item.coverImageUrl) : null,
      coverImageUrlSecondary:
        item.coverImageUrlSecondary != null ? String(item.coverImageUrlSecondary) : null,
      coverPartnerStatus:
        item.coverPartnerStatus === 'legal' || item.coverPartnerStatus === 'illegal'
          ? item.coverPartnerStatus
          : null,
    }));
  }

  async get(auth: AuthContext, env: ApiEnv, deckId: string): Promise<DeckDocument | null> {
    const userId = resolveUserId(auth, env);
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: deckSk(deckId) },
      }),
    );
    if (!result.Item) {
      return null;
    }
    const s3Key = String(result.Item.s3Key || `decks/${deckId}.json`);
    const body = await this.s3.getText(s3Key);
    if (!body) {
      return null;
    }
    const parsed = DeckDocumentSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  }

  async put(auth: AuthContext, env: ApiEnv, deckId: string, input: DeckDocument): Promise<DeckDocument> {
    const userId = resolveUserId(auth, env);
    const now = new Date().toISOString();
    const doc = DeckDocumentSchema.parse({
      ...input,
      deckId,
      updatedAt: now,
      createdAt: input.createdAt || now,
    });
    const s3Key = `decks/${deckId}.json`;
    const json = JSON.stringify(doc);
    await this.s3.putText(s3Key, json, 'application/json');
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: userPk(userId),
          SK: deckSk(deckId),
          entityType: 'DECK',
          deckId,
          deckName: doc.name,
          format: doc.format,
          archidektId: doc.archidektId,
          s3Key,
          byteSize: Buffer.byteLength(json, 'utf8'),
          schemaVersion: doc.schemaVersion,
          updatedAt: doc.updatedAt,
          createdAt: doc.createdAt,
          coverImageUrl: deckCoverImageUrl(doc),
          coverImageUrlSecondary: deckCoverImageUrlSecondary(doc),
          coverPartnerStatus: pickCoverPartnerStatus(doc),
        },
      }),
    );
    return doc;
  }

  async delete(auth: AuthContext, env: ApiEnv, deckId: string): Promise<boolean> {
    const userId = resolveUserId(auth, env);
    const existing = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: deckSk(deckId) },
      }),
    );
    if (!existing.Item) {
      return false;
    }
    const s3Key = String(existing.Item.s3Key || `decks/${deckId}.json`);
    if (this.s3.deleteObject) {
      await this.s3.deleteObject(s3Key);
    }
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: deckSk(deckId) },
      }),
    );
    return true;
  }
}
