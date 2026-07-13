#!/usr/bin/env node
/**
 * One-shot USER::default → USER::{sub} partition migration (Cognito cutover only).
 *
 * Usage:
 *   npx tsx scripts/migrate-user-partition.ts --dry-run
 *   npx tsx scripts/migrate-user-partition.ts --execute --target-sub <cognito-sub>
 *   npx tsx scripts/migrate-user-partition.ts --execute --target-sub <cognito-sub> --delete-bootstrap
 *
 * Env: HUB_TABLE_NAME (default HubTable), AWS_REGION (default us-east-1), DYNAMODB_ENDPOINT (optional)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { userPk } from '../packages/shared/src/keys.ts';

const BOOTSTRAP_PK = userPk('default');

interface CliOptions {
  dryRun: boolean;
  execute: boolean;
  targetSub: string | null;
  deleteBootstrap: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dryRun: true,
    execute: false,
    targetSub: null,
    deleteBootstrap: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
      opts.execute = false;
    } else if (arg === '--execute') {
      opts.execute = true;
      opts.dryRun = false;
    } else if (arg === '--delete-bootstrap') {
      opts.deleteBootstrap = true;
    } else if (arg === '--target-sub') {
      opts.targetSub = argv[++i] ?? null;
    }
  }
  return opts;
}

function createDocClient(): DynamoDBDocumentClient {
  const region = process.env.AWS_REGION || 'us-east-1';
  const config: ConstructorParameters<typeof DynamoDBClient>[0] = { region };
  if (process.env.DYNAMODB_ENDPOINT) {
    config.endpoint = process.env.DYNAMODB_ENDPOINT;
    config.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
  }
  return DynamoDBDocumentClient.from(new DynamoDBClient(config), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

async function listBootstrapItems(
  doc: DynamoDBDocumentClient,
  tableName: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await doc.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': BOOTSTRAP_PK },
        ExclusiveStartKey: lastKey,
      }),
    );
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const tableName = process.env.HUB_TABLE_NAME || 'HubTable';

  if (opts.execute && !opts.targetSub) {
    console.error('ERROR: --execute requires --target-sub <cognito-sub>');
    process.exit(1);
  }
  if (opts.deleteBootstrap && !opts.execute) {
    console.error('ERROR: --delete-bootstrap requires --execute');
    process.exit(1);
  }

  const doc = createDocClient();
  const items = await listBootstrapItems(doc, tableName);
  const targetPk = opts.targetSub ? userPk(opts.targetSub) : null;

  console.log(`Table: ${tableName}`);
  console.log(`Bootstrap partition: ${BOOTSTRAP_PK}`);
  console.log(`Items found: ${items.length}`);
  if (targetPk) {
    console.log(`Target partition: ${targetPk}`);
  }
  console.log(`Mode: ${opts.execute ? 'EXECUTE' : 'DRY-RUN'}`);
  console.log('');

  for (const item of items) {
    const sk = String(item.SK);
    console.log(`  ${sk} (${String(item.entityType ?? 'unknown')})`);
  }

  if (!opts.execute) {
    console.log('');
    console.log('Dry-run complete. Re-run with --execute --target-sub <sub> to copy items.');
    return;
  }

  let copied = 0;
  for (const item of items) {
    const copy = { ...item, PK: targetPk };
    await doc.send(new PutCommand({ TableName: tableName, Item: copy }));
    copied++;
    console.log(`Copied ${String(item.SK)} → ${targetPk}`);
  }

  const verify = await listBootstrapItems(doc, tableName);
  const targetItems = targetPk
    ? await doc.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': targetPk },
          Select: 'COUNT',
        }),
      )
    : null;

  console.log('');
  console.log(`Copied: ${copied}`);
  console.log(`Target partition count: ${targetItems?.Count ?? 'n/a'}`);
  console.log(`Bootstrap partition remaining: ${verify.length}`);

  if (opts.deleteBootstrap) {
    for (const item of verify) {
      await doc.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { PK: item.PK, SK: item.SK },
        }),
      );
      console.log(`Deleted bootstrap ${String(item.SK)}`);
    }
    const afterDelete = await listBootstrapItems(doc, tableName);
    console.log(`Bootstrap partition after delete: ${afterDelete.length}`);
  } else if (verify.length > 0) {
    console.log('');
    console.log('Bootstrap items retained. Re-run with --delete-bootstrap after verification.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
