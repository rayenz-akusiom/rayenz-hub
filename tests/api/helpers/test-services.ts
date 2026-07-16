import type { ApiEnv } from '../../../packages/api/src/lib/auth.ts';
import { createAppServices, type ContainerOverrides } from '../../../packages/api/src/ioc/index.ts';
import type { AppServices } from '../../../packages/api/src/ioc/app-services.ts';
import { SettingsRepository } from '../../../packages/api/src/repositories/settings-repository.ts';
import { ProfileRepository } from '../../../packages/api/src/repositories/profile-repository.ts';
import { ReviewProgressRepository } from '../../../packages/api/src/repositories/review-repository.ts';
import { SetPoolRepository } from '../../../packages/api/src/repositories/set-pool-repository.ts';
import { DeckRepository } from '../../../packages/api/src/repositories/deck-repository.ts';
import { MemoryDocClient } from './memory-dynamo.ts';
import { MemoryS3Store } from './memory-s3.ts';
import { asBlobStore } from './test-blob-store.ts';

export const TEST_API_KEY = 'test-api-key-local';

export function testApiEnv(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return {
    HUB_API_KEY: TEST_API_KEY,
    HUB_USER_ID: 'default',
    HUB_TABLE_NAME: 'HubTable',
    HUB_BUCKET_NAME: 'rayenz-hub-data-local',
    AWS_REGION: 'us-east-1',
    ...overrides,
  };
}

export const TEST_AUTH_HEADERS = { authorization: `Bearer ${TEST_API_KEY}` };

export function createTestServices(overrides: ContainerOverrides = {}): AppServices {
  return createAppServices({
    ...overrides,
    apiEnv: overrides.apiEnv ?? testApiEnv(),
  });
}

export function createMemoryStores() {
  const memory = new MemoryDocClient();
  const s3 = new MemoryS3Store();
  const blob = asBlobStore(s3);
  return {
    memory,
    s3,
    services: createTestServices({
      settingsRepository: new SettingsRepository(memory, 'HubTable'),
      profileRepository: new ProfileRepository(memory, 'HubTable', blob),
      reviewProgressRepository: new ReviewProgressRepository(memory, 'HubTable'),
      setPoolRepository: new SetPoolRepository(memory, 'HubTable', blob),
      deckRepository: new DeckRepository(memory, 'HubTable', blob),
    }),
  };
}
