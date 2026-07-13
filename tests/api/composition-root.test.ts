import { describe, expect, it } from 'vitest';
import { AuthService } from '../../packages/api/src/services/auth-service.ts';
import { SettingsRepository } from '../../packages/api/src/repositories/settings-repository.ts';
import { handleSettings } from '../../packages/api/src/handlers/settings.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';
import { createAppServices, createContainer, resolveAppServices } from '../../packages/api/src/ioc/index.ts';
import { TYPES } from '../../packages/api/src/ioc/types.ts';
import { createTestServices, TEST_AUTH_HEADERS, testApiEnv } from './helpers/test-services.ts';

describe('composition root', () => {
  it('resolves all app services from a container', () => {
    const services = createTestServices();
    expect(services.authService).toBeDefined();
    expect(services.settingsRepository).toBeDefined();
    expect(services.profileRepository).toBeDefined();
    expect(services.reviewProgressRepository).toBeDefined();
    expect(services.setPoolRepository).toBeDefined();
  });

  it('allows repository overrides without process.env', async () => {
    const memory = new MemoryDocClient();
    const repo = new SettingsRepository(memory, 'HubTable');
    const env = testApiEnv({ HUB_API_KEY: 'override-key' });
    const services = createAppServices({
      apiEnv: env,
      settingsRepository: repo,
      authService: new AuthService(env),
    });

    const denied = await handleSettings(
      'GET',
      'dailies',
      { authorization: 'Bearer wrong' },
      null,
      services,
    );
    expect(denied.statusCode).toBe(401);

    await handleSettings(
      'PUT',
      'dailies',
      { authorization: 'Bearer override-key' },
      JSON.stringify({ payload: { wishlists: [] } }),
      services,
    );
    const ok = await handleSettings(
      'GET',
      'dailies',
      { authorization: 'Bearer override-key' },
      null,
      services,
    );
    expect(ok.statusCode).toBe(200);
  });

  it('binds ApiEnv token in the container', () => {
    const env = testApiEnv({ HUB_TABLE_NAME: 'CustomTable' });
    const container = createContainer({ apiEnv: env });
    expect(container.get(TYPES.ApiEnv)).toEqual(env);
    expect(resolveAppServices(container).settingsRepository).toBeDefined();
  });
});
