#!/usr/bin/env node
/**
 * Write gitignored infra/env.local.overlay.json from the live Cognito pool
 * so SAM local can InitiateAuth as Rayenz.
 *
 * Usage:
 *   npm run setup:local-cognito
 *
 * Env: AWS_REGION (default us-east-1), HUB_OWNER_USERNAME (default Rayenz),
 *      HUB_COGNITO_POOL_NAME (default rayenz-hub),
 *      HUB_COGNITO_CLIENT_NAME (default rayenz-hub-api)
 */
import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  ListUserPoolClientsCommand,
  ListUserPoolsCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overlayPath = path.join(root, 'infra', 'env.local.overlay.json');

const POOL_NAME = process.env.HUB_COGNITO_POOL_NAME || 'rayenz-hub';
const CLIENT_NAME = process.env.HUB_COGNITO_CLIENT_NAME || 'rayenz-hub-api';

/** MinIO bucket-create leftovers — not real AWS credentials. */
export function dummyAwsCredentialMessage(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = env.AWS_ACCESS_KEY_ID?.trim();
  if (!id || id.toLowerCase() !== 'local') {
    return null;
  }
  return [
    'ERROR: AWS_ACCESS_KEY_ID is "local" (MinIO dummy credentials).',
    'Those exist only so this one-time command can talk to MinIO on your machine:',
    '  aws --endpoint-url http://127.0.0.1:9000 s3 mb s3://rayenz-hub-data-local',
    'If they are still set in this PowerShell window, AWS CLI/SDK will send "local" to real Cognito and fail.',
    'Clear them, then retry:',
    '  Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY',
  ].join('\n');
}

async function findPoolId(client: CognitoIdentityProviderClient, name: string): Promise<string> {
  let nextToken: string | undefined;
  do {
    const out = await client.send(new ListUserPoolsCommand({ MaxResults: 60, NextToken: nextToken }));
    const hit = out.UserPools?.find((pool) => pool.Name === name);
    if (hit?.Id) {
      return hit.Id;
    }
    nextToken = out.NextToken;
  } while (nextToken);
  throw new Error(`ERROR: Cognito user pool named "${name}" not found in this account/region`);
}

async function findClientId(
  client: CognitoIdentityProviderClient,
  poolId: string,
  name: string,
): Promise<string> {
  let nextToken: string | undefined;
  do {
    const out = await client.send(
      new ListUserPoolClientsCommand({ UserPoolId: poolId, MaxResults: 60, NextToken: nextToken }),
    );
    const hit = out.UserPoolClients?.find((c) => c.ClientName === name);
    if (hit?.ClientId) {
      return hit.ClientId;
    }
    nextToken = out.NextToken;
  } while (nextToken);
  throw new Error(`ERROR: Cognito app client named "${name}" not found in pool ${poolId}`);
}

async function main(): Promise<void> {
  const dummy = dummyAwsCredentialMessage();
  if (dummy) {
    throw new Error(dummy);
  }

  const region = process.env.AWS_REGION || 'us-east-1';
  const username = process.env.HUB_OWNER_USERNAME || 'Rayenz';
  const client = new CognitoIdentityProviderClient({ region });

  const poolId = await findPoolId(client, POOL_NAME);
  const clientId = await findClientId(client, poolId, CLIENT_NAME);
  const described = await client.send(
    new DescribeUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId }),
  );
  const clientSecret = described.UserPoolClient?.ClientSecret?.trim() || '';
  if (!clientSecret) {
    throw new Error('ERROR: Cognito client secret was empty — expected GenerateSecret on HubUserPoolClient');
  }

  let sub = '';
  try {
    const user = await client.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: username }));
    sub = user.UserAttributes?.find((a) => a.Name === 'sub')?.Value?.trim() || '';
  } catch (err) {
    if (err instanceof UserNotFoundException) {
      throw new Error(
        `ERROR: Cognito user ${username} not found. Provision first: npm run provision:owner`,
      );
    }
    throw err;
  }
  if (!sub) {
    throw new Error(
      `ERROR: Cognito user ${username} has no sub. Provision first: npm run provision:owner`,
    );
  }

  const overlay = {
    HubApiFunction: {
      COGNITO_USER_POOL_ID: poolId,
      COGNITO_CLIENT_ID: clientId,
      COGNITO_CLIENT_SECRET: clientSecret,
      HUB_USER_ID: sub,
      HUB_OWNER_SUB: sub,
      HUB_OWNER_USERNAME: username,
    },
  };
  writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
  console.log(`Wrote ${overlayPath}`);
  console.log(`pool=${poolId} client=${clientId} user=${username} sub=${sub}`);
  console.log('Do not commit this file. Then migrate local data if it still lives under USER::rayenz-local:');
  console.log(`  $env:HUB_MIGRATE_SOURCE_USER_ID = 'rayenz-local'`);
  console.log(`  npx tsx scripts/migrate-user-partition.ts --execute --target-sub ${sub}`);
}

const isMain = ['setup-local-cognito.ts', 'setup-local-cognito.js'].includes(
  path.basename(process.argv[1] || ''),
);

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
