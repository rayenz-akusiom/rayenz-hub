import { describe, expect, it } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { BOOTSTRAP_USER_ID } from '../../packages/shared/src/user-context.ts';
import { userPk } from '../../packages/shared/src/keys.ts';
import { copyPartition } from '../../packages/api/src/lib/partition-migrate.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';
import { MemoryS3Store } from './helpers/memory-s3.ts';

describe('migrate user partition', () => {
  it('dry-run inventories without writes', async () => {
    const memory = new MemoryDocClient();
    const s3 = new MemoryS3Store();
    await memory.send(
      new PutCommand({
        TableName: 'HubTable',
        Item: {
          PK: userPk(BOOTSTRAP_USER_ID),
          SK: 'SETTINGS::DAILIES',
          s3Key: 'profiles/x.yaml',
        },
      }),
    );
    await s3.putText('profiles/x.yaml', 'deck_id: x');
    const dry = await copyPartition({
      doc: memory,
      tableName: 'HubTable',
      sourceUserId: BOOTSTRAP_USER_ID,
      targetUserId: 'rayenz-sub',
      blob: s3,
      execute: false,
    });
    expect(dry.items).toHaveLength(1);
    expect(dry.copied).toBe(0);
    expect([...memory.snapshot().keys()].some((k) => k.startsWith('USER::rayenz-sub'))).toBe(false);

    const executed = await copyPartition({
      doc: memory,
      tableName: 'HubTable',
      sourceUserId: BOOTSTRAP_USER_ID,
      targetUserId: 'rayenz-sub',
      blob: s3,
      execute: true,
      deleteSource: true,
    });
    expect(executed.copied).toBe(1);
    expect(executed.deleted).toBe(1);
    expect(s3.snapshot().has('users/rayenz-sub/profiles/x.yaml')).toBe(true);
  });
});
