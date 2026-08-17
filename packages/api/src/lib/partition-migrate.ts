import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { migrateS3KeyToUser, userPk } from '@rayenz-hub/shared';

type DocClient = Pick<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient, 'send'>;

export type BlobCopyStore = {
  getText(key: string): Promise<string | null>;
  putText(key: string, body: string, contentType?: string): Promise<void>;
  deleteObject?(key: string): Promise<void>;
};

export type PartitionItem = Record<string, unknown> & { PK?: string; SK?: string; s3Key?: string };

export async function listPartitionItems(doc: DocClient, tableName: string, userId: string): Promise<PartitionItem[]> {
  const items: PartitionItem[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = (await doc.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': userPk(userId) },
        ExclusiveStartKey: lastKey,
      }),
    )) as { Items?: PartitionItem[]; LastEvaluatedKey?: Record<string, unknown> };
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export async function copyPartition(options: {
  doc: DocClient;
  tableName: string;
  sourceUserId: string;
  targetUserId: string;
  blob?: BlobCopyStore;
  execute: boolean;
  deleteSource?: boolean;
}): Promise<{
  items: PartitionItem[];
  s3Copies: Array<{ from: string; to: string }>;
  copied: number;
  deleted: number;
}> {
  const items = await listPartitionItems(options.doc, options.tableName, options.sourceUserId);
  const s3Copies: Array<{ from: string; to: string }> = [];
  let copied = 0;
  let deleted = 0;

  for (const item of items) {
    const next = { ...item, PK: userPk(options.targetUserId) };
    const fromKey = typeof item.s3Key === 'string' ? item.s3Key : undefined;
    if (fromKey) {
      const toKey = migrateS3KeyToUser(options.targetUserId, fromKey);
      s3Copies.push({ from: fromKey, to: toKey });
      next.s3Key = toKey;
      if (options.execute && options.blob) {
        const body = await options.blob.getText(fromKey);
        if (body != null) {
          await options.blob.putText(toKey, body, 'application/octet-stream');
        }
      }
    }
    if (options.execute) {
      await options.doc.send(new PutCommand({ TableName: options.tableName, Item: next }));
      copied += 1;
    }
  }

  if (options.execute && options.deleteSource) {
    const remaining = await listPartitionItems(options.doc, options.tableName, options.sourceUserId);
    for (const item of remaining) {
      await options.doc.send(
        new DeleteCommand({
          TableName: options.tableName,
          Key: { PK: item.PK, SK: item.SK },
        }),
      );
      deleted += 1;
    }
  }

  return { items, s3Copies, copied, deleted };
}

export async function mirrorPartition(options: {
  sourceDoc: DocClient;
  targetDoc: DocClient;
  sourceTable: string;
  targetTable: string;
  ownerSub: string;
  sourceBlob?: BlobCopyStore;
  targetBlob?: BlobCopyStore;
  execute: boolean;
  skipGlanceCache?: boolean;
}): Promise<{ creates: string[]; replaces: string[]; deletes: string[] }> {
  const source = await listPartitionItems(options.sourceDoc, options.sourceTable, options.ownerSub);
  const target = await listPartitionItems(options.targetDoc, options.targetTable, options.ownerSub);
  const sourceBySk = new Map(source.map((i) => [String(i.SK), i]));
  const targetBySk = new Map(target.map((i) => [String(i.SK), i]));
  const creates: string[] = [];
  const replaces: string[] = [];
  const deletes: string[] = [];

  for (const [sk] of sourceBySk) {
    if (options.skipGlanceCache && /glance/i.test(sk)) continue;
    if (targetBySk.has(sk)) replaces.push(sk);
    else creates.push(sk);
  }
  for (const [sk] of targetBySk) {
    if (options.skipGlanceCache && /glance/i.test(sk)) continue;
    if (!sourceBySk.has(sk)) deletes.push(sk);
  }

  if (!options.execute) {
    return { creates, replaces, deletes };
  }

  for (const sk of deletes) {
    const item = targetBySk.get(sk);
    if (!item) continue;
    if (options.targetBlob && typeof item.s3Key === 'string' && options.targetBlob.deleteObject) {
      await options.targetBlob.deleteObject(item.s3Key);
    }
    await options.targetDoc.send(
      new DeleteCommand({
        TableName: options.targetTable,
        Key: { PK: item.PK, SK: item.SK },
      }),
    );
  }

  for (const item of source) {
    const sk = String(item.SK);
    if (options.skipGlanceCache && /glance/i.test(sk)) continue;
    const next = { ...item, PK: userPk(options.ownerSub) };
    if (typeof item.s3Key === 'string') {
      const toKey = migrateS3KeyToUser(options.ownerSub, item.s3Key);
      next.s3Key = toKey;
      if (options.sourceBlob && options.targetBlob) {
        const body = await options.sourceBlob.getText(item.s3Key);
        if (body != null) {
          await options.targetBlob.putText(toKey, body, 'application/octet-stream');
        }
      }
    }
    await options.targetDoc.send(new PutCommand({ TableName: options.targetTable, Item: next }));
  }

  return { creates, replaces, deletes };
}
