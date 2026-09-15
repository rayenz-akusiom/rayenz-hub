#!/usr/bin/env node
/**
 * Provision Cognito catalog username `precons` (unlimited Commander precon library).
 *
 * Usage:
 *   HUB_PRECONS_PASSWORD='...' HUB_PRECONS_EMAIL='...' npx tsx scripts/provision-precons-account.ts
 *
 * Env: COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, AWS_REGION,
 *      HUB_PRECONS_USERNAME (default precons), HUB_PRECONS_PASSWORD (required),
 *      HUB_PRECONS_EMAIL (required), HUB_TABLE_NAME
 */
import { PRECONS_USERNAME } from '../packages/shared/src/usernames.ts';
import { AwsCognitoAuthPort } from '../packages/api/src/services/cognito-auth.ts';
import { readEnv } from '../packages/api/src/lib/auth.ts';
import { createDocClient } from '../packages/api/src/repositories/settings-repository.ts';
import { UsernameDirectory } from '../packages/api/src/repositories/username-directory.ts';
import { UsernameDirectoryService } from '../packages/api/src/services/username-directory-service.ts';

async function main(): Promise<void> {
  const env = readEnv();
  const username = process.env.HUB_PRECONS_USERNAME?.trim() || PRECONS_USERNAME;
  const password = process.env.HUB_PRECONS_PASSWORD;
  const email = process.env.HUB_PRECONS_EMAIL?.trim();
  if (!password) {
    console.error('ERROR: set HUB_PRECONS_PASSWORD');
    process.exit(1);
  }
  if (!email) {
    console.error('ERROR: set HUB_PRECONS_EMAIL');
    process.exit(1);
  }
  if (!env.COGNITO_USER_POOL_ID || !env.COGNITO_CLIENT_ID) {
    console.error('ERROR: set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID');
    process.exit(1);
  }
  const cognito = new AwsCognitoAuthPort(env);
  const existing = await cognito.findUser(username);
  const user = existing ?? (await cognito.adminCreateUser(username, password, email));
  if (existing) {
    console.log(`Precons account ${username} already exists. sub=${existing.sub}`);
  } else {
    console.log(`Created precons account ${user.username} sub=${user.sub}`);
  }
  const tableName = env.HUB_TABLE_NAME || 'HubTable';
  const directory = new UsernameDirectoryService(new UsernameDirectory(createDocClient(env), tableName));
  await directory.upsert(user.username, user.sub);
  console.log(`Username directory: ${user.username} → ${user.sub}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
