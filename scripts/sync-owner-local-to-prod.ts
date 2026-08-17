#!/usr/bin/env node
/**
 * Owner-only local → production replace sync.
 *
 * Usage:
 *   npx tsx scripts/sync-owner-local-to-prod.ts --dry-run
 *   npx tsx scripts/sync-owner-local-to-prod.ts --execute --confirm REPLACE_PRODUCTION
 *
 * Env: HUB_OWNER_SUB (required, Rayenz Cognito sub)
 *   Local: DYNAMODB_ENDPOINT, S3_ENDPOINT, HUB_TABLE_NAME, HUB_BUCKET_NAME
 *   Prod: AWS creds; PROD_HUB_TABLE_NAME, PROD_HUB_BUCKET_NAME, PROD_DYNAMODB_ENDPOINT, PROD_S3_ENDPOINT
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { mirrorPartition } from '../packages/api/src/lib/partition-migrate.ts';
import { S3BlobStore } from '../packages/api/src/repositories/s3-blob-store.ts';

interface CliOptions {
  execute: boolean;
  confirm: string | null;
  skipGlanceCache: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { execute: false, confirm: null, skipGlanceCache: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execute') opts.execute = true;
    else if (arg === '--confirm') opts.confirm = argv[++i] ?? null;
    else if (arg === '--skip-glance-cache') opts.skipGlanceCache = true;
  }
  return opts;
}

function docClient(endpoint?: string): DynamoDBDocumentClient {
  const region = process.env.AWS_REGION || 'us-east-1';
  const config: ConstructorParameters<typeof DynamoDBClient>[0] = { region };
  if (endpoint) {
    config.endpoint = endpoint;
    config.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
  }
  return DynamoDBDocumentClient.from(new DynamoDBClient(config), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

function blob(endpoint: string | undefined, bucket: string): S3BlobStore {
  const region = process.env.AWS_REGION || 'us-east-1';
  const config: ConstructorParameters<typeof S3Client>[0] = { region };
  if (endpoint) {
    config.endpoint = endpoint;
    config.forcePathStyle = true;
    config.credentials = { accessKeyId: 'local', secretAccessKey: 'localpass1' };
  }
  return new S3BlobStore(new S3Client(config), bucket);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const ownerSub = process.env.HUB_OWNER_SUB?.trim();
  if (!ownerSub) {
    console.error('ERROR: HUB_OWNER_SUB is required (Rayenz Cognito sub)');
    process.exit(1);
  }
  if (opts.execute && opts.confirm !== 'REPLACE_PRODUCTION') {
    console.error('ERROR: --execute requires --confirm REPLACE_PRODUCTION');
    process.exit(1);
  }

  const localTable = process.env.HUB_TABLE_NAME || 'HubTable';
  const prodTable = process.env.PROD_HUB_TABLE_NAME || localTable;
  const localBucket = process.env.HUB_BUCKET_NAME || 'rayenz-hub-data-local';
  const prodBucket = process.env.PROD_HUB_BUCKET_NAME || localBucket;

  const plan = await mirrorPartition({
    sourceDoc: docClient(process.env.DYNAMODB_ENDPOINT),
    targetDoc: docClient(process.env.PROD_DYNAMODB_ENDPOINT),
    sourceTable: localTable,
    targetTable: prodTable,
    ownerSub,
    sourceBlob: blob(process.env.S3_ENDPOINT, localBucket),
    targetBlob: blob(process.env.PROD_S3_ENDPOINT, prodBucket),
    execute: opts.execute,
    skipGlanceCache: opts.skipGlanceCache,
  });

  console.log(`creates=${plan.creates.length} replaces=${plan.replaces.length} deletes=${plan.deletes.length}`);
  for (const sk of plan.creates) console.log(`  create ${sk}`);
  for (const sk of plan.replaces) console.log(`  replace ${sk}`);
  for (const sk of plan.deletes) console.log(`  delete ${sk}`);
  if (!opts.execute) {
    console.log('Dry-run complete. Zero production writes.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
