import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  isReservedUsername,
  normalizeUsername,
  usernamePk,
  usernameToSlug,
} from '@rayenz-hub/shared';

type DocClient = Pick<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient, 'send'>;

export type UsernameRecord = {
  sub: string;
  username: string;
  slug: string;
};

export class UsernameDirectory {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
  ) {}

  async put(username: string, sub: string): Promise<UsernameRecord | null> {
    const normalized = normalizeUsername(username);
    const slug = usernameToSlug(normalized);
    if (!slug || !sub || isReservedUsername(normalized)) {
      return null;
    }
    const record: UsernameRecord = { sub, username: normalized, slug };
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: usernamePk(slug),
          SK: 'META',
          entityType: 'USERNAME',
          sub,
          username: normalized,
          slug,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    return record;
  }

  async getBySlug(slug: string): Promise<UsernameRecord | null> {
    const key = usernameToSlug(slug) || slug.trim().toLowerCase();
    if (!key) {
      return null;
    }
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: usernamePk(key), SK: 'META' },
      }),
    );
    if (!result.Item) {
      return null;
    }
    const sub = String(result.Item.sub ?? '');
    const username = String(result.Item.username ?? '');
    if (!sub) {
      return null;
    }
    return { sub, username, slug: String(result.Item.slug ?? key) };
  }
}
