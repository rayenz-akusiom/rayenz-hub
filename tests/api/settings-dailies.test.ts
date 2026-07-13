import { afterEach, describe, expect, it } from 'vitest';
import { handleSettings } from '../../packages/api/src/handlers/settings.ts';
import { SettingsRepository } from '../../packages/api/src/repositories/settings-repository.ts';
import { resetAppServices } from '../../packages/api/src/ioc/index.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';
import { TEST_AUTH_HEADERS, createTestServices, testApiEnv } from './helpers/test-services.ts';

describe('settings dailies API', () => {
  afterEach(() => {
    resetAppServices();
  });

  it('returns 401 without API key', async () => {
    const services = createTestServices();
    const result = await handleSettings(
      'PUT',
      'dailies',
      {},
      JSON.stringify({ payload: { wishlists: [] } }),
      services,
    );
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(String(result.body)).error).toBe('Unauthorized');
  });

  it('returns 401 with invalid API key', async () => {
    const memory = new MemoryDocClient();
    const services = createTestServices({
      settingsRepository: new SettingsRepository(memory, 'HubTable'),
    });
    const result = await handleSettings(
      'GET',
      'dailies',
      { authorization: 'Bearer wrong-key' },
      null,
      services,
    );
    expect(result.statusCode).toBe(401);
  });

  it('round-trips dailies settings via repository partition keys', async () => {
    const memory = new MemoryDocClient();
    const repo = new SettingsRepository(memory, 'HubTable');
    const services = createTestServices({ settingsRepository: repo });
    const payload = { wishlists: [{ id: 'books', label: 'Books' }], schools: { battledome: true } };
    const putResult = await handleSettings(
      'PUT',
      'dailies',
      TEST_AUTH_HEADERS,
      JSON.stringify({ payload }),
      services,
    );
    expect(putResult.statusCode).toBe(200);
    const putBody = JSON.parse(String(putResult.body));
    expect(putBody.domain).toBe('dailies');
    expect(putBody.payload).toEqual(payload);

    const getResult = await handleSettings('GET', 'dailies', TEST_AUTH_HEADERS, null, services);
    expect(getResult.statusCode).toBe(200);
    expect(JSON.parse(String(getResult.body)).payload).toEqual(payload);

    const stored = [...memory.snapshot().values()][0];
    expect(stored.PK).toBe('USER::default');
    expect(stored.SK).toBe('SETTINGS::DAILIES');
  });

  it('returns 404 when settings are missing', async () => {
    const memory = new MemoryDocClient();
    const services = createTestServices({
      settingsRepository: new SettingsRepository(memory, 'HubTable'),
    });
    const result = await handleSettings('GET', 'dailies', TEST_AUTH_HEADERS, null, services);
    expect(result.statusCode).toBe(404);
  });
});
