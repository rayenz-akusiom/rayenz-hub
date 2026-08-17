#!/usr/bin/env node
/**
 * One-shot USER::{bootstrap} → USER::{sub} partition migration (Cognito cutover).
 *
 * Usage:
 *   npx tsx scripts/migrate-user-partition.ts --dry-run
 *   npx tsx scripts/migrate-user-partition.ts --execute --target-sub <cognito-sub>
 *   npx tsx scripts/migrate-user-partition.ts --execute --target-sub <cognito-sub> --delete-bootstrap
 *
 * Env: HUB_TABLE_NAME, AWS_REGION, DYNAMODB_ENDPOINT, HUB_BUCKET_NAME, S3_ENDPOINT,
 *      HUB_MIGRATE_SOURCE_USER_ID (default: default)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { BOOTSTRAP_USER_ID } from '../packages/shared/src/user-context.ts';
import { copyPartition } from '../packages/api/src/lib/partition-migrate.ts';
import { createS3Client, S3BlobStore } from '../packages/api/src/repositories/s3-blob-store.ts';
import { readEnv } from '../packages/api/src/lib/auth.ts';

interface CliOptions {
  execute: boolean;
  targetSub: string | null;
  deleteBootstrap: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { execute: false, targetSub: null, deleteBootstrap: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execute') opts.execute = true;
    else if (arg === '--delete-bootstrap') opts.deleteBootstrap = true;
    else if (arg === '--target-sub') opts.targetSub = argv[++i] ?? null;
  }
  return opts;
}

function createDocClient() {
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
  const targetSub = opts.targetSub || 'dry-run';
  if (process.env.DYNAMODB_ENDPOINT && !process.env.S3_ENDPOINT) {
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9000';
  }
  const env = readEnv();
  const endpoint = process.env.DYNAMODB_ENDPOINT || `AWS ${process.env.AWS_REGION || 'us-east-1'}`;
  const s3Endpoint = env.S3_ENDPOINT || `AWS ${env.AWS_REGION || 'us-east-1'}`;
  const bucket = env.HUB_BUCKET_NAME || 'rayenz-hub-data-local';
  const sourceUserId = process.env.HUB_MIGRATE_SOURCE_USER_ID?.trim() || BOOTSTRAP_USER_ID;
  console.log(`Query: table=${tableName} endpoint=${endpoint} source=USER::${sourceUserId}`);
  console.log(`S3: bucket=${bucket} endpoint=${s3Endpoint}`);
  if (!process.env.DYNAMODB_ENDPOINT) {
    console.log(
      'Note: no DYNAMODB_ENDPOINT — this is production DynamoDB. Local library needs $env:DYNAMODB_ENDPOINT="http://127.0.0.1:8000"',
    );
  }
  const blob = new S3BlobStore(createS3Client(env), bucket);
  const result = await copyPartition({
    doc: createDocClient(),
    tableName,
    sourceUserId,
    targetUserId: targetSub,
    blob,
    execute: opts.execute,
    deleteSource: opts.deleteBootstrap,
  });
  console.log(`Items found: ${result.items.length}`);
  for (const item of result.items) {
    console.log(`  ${String(item.SK)}`);
  }
  console.log(`S3 copies planned: ${result.s3Copies.length}`);
  for (const copy of result.s3Copies) {
    console.log(`  ${copy.from} → ${copy.to}`);
  }
  console.log(`Mode: ${opts.execute ? 'EXECUTE' : 'DRY-RUN'}`);
  if (opts.execute) {
    console.log(`Copied: ${result.copied}; deleted source: ${result.deleted}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
