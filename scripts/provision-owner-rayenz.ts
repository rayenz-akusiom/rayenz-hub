#!/usr/bin/env node
/**
 * Provision Cognito owner username Rayenz at production cutover.
 *
 * Usage:
 *   HUB_OWNER_PASSWORD='...' HUB_OWNER_EMAIL='...' npx tsx scripts/provision-owner-rayenz.ts
 *
 * Env: COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, AWS_REGION, HUB_OWNER_USERNAME (default Rayenz),
 *      HUB_OWNER_PASSWORD (required), HUB_OWNER_EMAIL (required)
 */
import { AwsCognitoAuthPort } from '../packages/api/src/services/cognito-auth.ts';
import { readEnv } from '../packages/api/src/lib/auth.ts';
import { createDocClient } from '../packages/api/src/repositories/settings-repository.ts';
import { UsernameDirectory } from '../packages/api/src/repositories/username-directory.ts';
import { UsernameDirectoryService } from '../packages/api/src/services/username-directory-service.ts';

async function main(): Promise<void> {
  const env = readEnv();
  const username = env.HUB_OWNER_USERNAME || 'rayenz';
  const password = process.env.HUB_OWNER_PASSWORD;
  const email = process.env.HUB_OWNER_EMAIL?.trim();
  if (!password) {
    console.error('ERROR: set HUB_OWNER_PASSWORD');
    process.exit(1);
  }
  if (!email) {
    console.error('ERROR: set HUB_OWNER_EMAIL');
    process.exit(1);
  }
  if (!env.COGNITO_USER_POOL_ID || !env.COGNITO_CLIENT_ID) {
    console.error('ERROR: set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID');
    process.exit(1);
  }
  const cognito = new AwsCognitoAuthPort(env);
  const existing = await cognito.findUser(username);
  const owner = existing ?? (await cognito.adminCreateUser(username, password, email));
  if (existing) {
    console.log(`Owner ${username} already exists. sub=${existing.sub}`);
  } else {
    console.log(`Created owner ${owner.username} sub=${owner.sub}`);
  }
  const tableName = env.HUB_TABLE_NAME || 'HubTable';
  const directory = new UsernameDirectoryService(new UsernameDirectory(createDocClient(env), tableName));
  await directory.upsert(owner.username, owner.sub);
  console.log(`Username directory: ${owner.username} → ${owner.sub}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
