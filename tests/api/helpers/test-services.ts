import type { ApiEnv } from '../../../packages/api/src/lib/auth.ts';
import { createAppServices, type ContainerOverrides } from '../../../packages/api/src/ioc/index.ts';
import type { AppServices } from '../../../packages/api/src/ioc/app-services.ts';
import { SettingsRepository } from '../../../packages/api/src/repositories/settings-repository.ts';
import { ProfileRepository } from '../../../packages/api/src/repositories/profile-repository.ts';
import { ReviewProgressRepository } from '../../../packages/api/src/repositories/review-repository.ts';
import { SetPoolRepository } from '../../../packages/api/src/repositories/set-pool-repository.ts';
import { DeckRepository } from '../../../packages/api/src/repositories/deck-repository.ts';
import { MemoryCognitoAuthPort } from '../../../packages/api/src/services/cognito-auth.ts';
import { SpendLockService } from '../../../packages/api/src/services/spend-lock.ts';
import { RateLimitService } from '../../../packages/api/src/services/rate-limit.ts';
import { InviteRepository, InviteService } from '../../../packages/api/src/services/invite-service.ts';
import { MemoryDocClient } from './memory-dynamo.ts';
import { MemoryS3Store } from './memory-s3.ts';
import { asBlobStore } from './test-blob-store.ts';

import { encodeTestJwt } from '../../../packages/api/src/lib/jwt.ts';

export const TEST_JWT_SUB = 'default';
export const TEST_JWT = encodeTestJwt({ sub: TEST_JWT_SUB, username: 'Rayenz' });

export function testApiEnv(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return {
    HUB_USER_ID: 'default',
    HUB_TABLE_NAME: 'HubTable',
    HUB_BUCKET_NAME: 'rayenz-hub-data-local',
    AWS_REGION: 'us-east-1',
    HUB_OWNER_USERNAME: 'Rayenz',
    HUB_JWT_TEST_MODE: 'true',
    HUB_PAGES_ORIGIN: 'https://example.test',
    ...overrides,
  };
}

export const TEST_AUTH_HEADERS = { authorization: `Bearer ${TEST_JWT}` };

export function createTestServices(overrides: ContainerOverrides = {}): AppServices {
  const memoryFallback = new MemoryDocClient();
  return createAppServices({
    ...overrides,
    apiEnv: overrides.apiEnv ?? testApiEnv(),
    docClient: overrides.docClient ?? memoryFallback,
    cognitoAuth:
      overrides.cognitoAuth ??
      new MemoryCognitoAuthPort([{ username: 'Rayenz', password: 'test-password-1', sub: 'rayenz-sub' }]),
  });
}

export function createMemoryStores() {
  const memory = new MemoryDocClient();
  const s3 = new MemoryS3Store();
  const blob = asBlobStore(s3);
  const env = testApiEnv();
  return {
    memory,
    s3,
    services: createTestServices({
      apiEnv: env,
      docClient: memory,
      cognitoAuth: new MemoryCognitoAuthPort([
        { username: 'Rayenz', password: 'test-password-1', sub: 'rayenz-sub' },
      ]),
      spendLock: new SpendLockService(memory, 'HubTable'),
      rateLimit: new RateLimitService(memory, 'HubTable'),
      inviteService: new InviteService(new InviteRepository(memory, 'HubTable'), env),
      settingsRepository: new SettingsRepository(memory, 'HubTable'),
      profileRepository: new ProfileRepository(memory, 'HubTable', blob),
      reviewProgressRepository: new ReviewProgressRepository(memory, 'HubTable'),
      setPoolRepository: new SetPoolRepository(memory, 'HubTable', blob),
      deckRepository: new DeckRepository(memory, 'HubTable', blob),
    }),
  };
}
