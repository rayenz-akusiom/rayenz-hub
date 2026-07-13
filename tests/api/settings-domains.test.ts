import { describe, expect, it } from 'vitest';
import { handleSettings } from '../../packages/api/src/handlers/settings.ts';
import { SettingsRepository } from '../../packages/api/src/repositories/settings-repository.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';
import { TEST_AUTH_HEADERS, createTestServices } from './helpers/test-services.ts';

describe('settings domains', () => {
  it.each(['order-reconcile', 'deck-suggest'] as const)('round-trips %s settings', async (domain) => {
    const memory = new MemoryDocClient();
    const services = createTestServices({
      settingsRepository: new SettingsRepository(memory, 'HubTable'),
    });
    const payload = { folderUrl: 'https://archidekt.com/folders/81998' };
    const put = await handleSettings('PUT', domain, TEST_AUTH_HEADERS, JSON.stringify({ payload }), services);
    expect(put.statusCode).toBe(200);
    const get = await handleSettings('GET', domain, TEST_AUTH_HEADERS, null, services);
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(String(get.body)).payload).toEqual(payload);
  });
});
