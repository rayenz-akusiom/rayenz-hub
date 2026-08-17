import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SPEND_LOCK_SK, SYSTEM_PK } from '@rayenz-hub/shared';

type DocClient = Pick<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient, 'send'>;

export type SpendLockRecord = {
  active: boolean;
  updatedAt: string;
  reason?: string;
  periodKey?: string;
};

export class SpendLockService {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
  ) {}

  async get(): Promise<SpendLockRecord> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: SYSTEM_PK, SK: SPEND_LOCK_SK },
      }),
    );
    const item = result.Item;
    if (!item) {
      return { active: false, updatedAt: '' };
    }
    return {
      active: Boolean(item.active),
      updatedAt: String(item.updatedAt ?? ''),
      reason: item.reason ? String(item.reason) : undefined,
      periodKey: item.periodKey ? String(item.periodKey) : undefined,
    };
  }

  async isActive(): Promise<boolean> {
    const record = await this.get();
    return record.active;
  }

  async setActive(active: boolean, reason: string): Promise<SpendLockRecord> {
    const now = new Date().toISOString();
    const periodKey = `${now.slice(0, 7)}`;
    const item = {
      PK: SYSTEM_PK,
      SK: SPEND_LOCK_SK,
      entityType: 'SPEND_LOCK',
      active,
      reason,
      periodKey,
      updatedAt: now,
    };
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: item }));
    return { active, updatedAt: now, reason, periodKey };
  }
}
