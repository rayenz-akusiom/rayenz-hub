import { describe, expect, it } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { userPk } from '../../packages/shared/src/keys.ts';
import { mirrorPartition } from '../../packages/api/src/lib/partition-migrate.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';
import { MemoryS3Store } from './helpers/memory-s3.ts';

describe('owner local to prod sync', () => {
  it('dry-run reports replace/delete without writing target', async () => {
    const local = new MemoryDocClient();
    const prod = new MemoryDocClient();
    const localS3 = new MemoryS3Store();
    const prodS3 = new MemoryS3Store();
    const owner = 'rayenz-sub';
    await local.send(
      new PutCommand({
        TableName: 'HubTable',
        Item: { PK: userPk(owner), SK: 'SETTINGS::DAILIES', payload: { v: 1 } },
      }),
    );
    await prod.send(
      new PutCommand({
        TableName: 'HubTable',
        Item: { PK: userPk(owner), SK: 'SETTINGS::DAILIES', payload: { v: 0 } },
      }),
    );
    await prod.send(
      new PutCommand({
        TableName: 'HubTable',
        Item: { PK: userPk(owner), SK: 'DECK::extra', s3Key: 'users/rayenz-sub/decks/extra.json' },
      }),
    );
    await prodS3.putText('users/rayenz-sub/decks/extra.json', '{}');

    const dry = await mirrorPartition({
      sourceDoc: local,
      targetDoc: prod,
      sourceTable: 'HubTable',
      targetTable: 'HubTable',
      ownerSub: owner,
      sourceBlob: localS3,
      targetBlob: prodS3,
      execute: false,
    });
    expect(dry.replaces).toContain('SETTINGS::DAILIES');
    expect(dry.deletes).toContain('DECK::extra');
    expect([...prod.snapshot().keys()].some((k) => k.includes('DECK::extra'))).toBe(true);

    const executed = await mirrorPartition({
      sourceDoc: local,
      targetDoc: prod,
      sourceTable: 'HubTable',
      targetTable: 'HubTable',
      ownerSub: owner,
      sourceBlob: localS3,
      targetBlob: prodS3,
      execute: true,
    });
    expect(executed.deletes).toContain('DECK::extra');
    expect([...prod.snapshot().keys()].some((k) => k.includes('DECK::extra'))).toBe(false);
  });
});
