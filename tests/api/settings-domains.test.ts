import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { handleSettings } from '../../packages/api/src/handlers/settings.ts';
import { SettingsRepository } from '../../packages/api/src/repositories/settings-repository.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';

const API_KEY = 'test-api-key-local';
const AUTH = { authorization: `Bearer ${API_KEY}` };

describe('settings domains', () => {
  let memory: MemoryDocClient;
  let repo: SettingsRepository;

  beforeEach(() => {
    process.env.HUB_API_KEY = API_KEY;
    process.env.HUB_USER_ID = 'default';
    memory = new MemoryDocClient();
    repo = new SettingsRepository(memory, 'HubTable');
  });

  afterEach(() => {
    delete process.env.HUB_API_KEY;
  });

  it.each(['order-reconcile', 'deck-suggest'] as const)('round-trips %s settings', async (domain) => {
    const payload = { folderUrl: 'https://archidekt.com/folders/81998' };
    const put = await handleSettings('PUT', domain, AUTH, JSON.stringify({ payload }), { settingsRepo: repo });
    expect(put.statusCode).toBe(200);
    const get = await handleSettings('GET', domain, AUTH, null, { settingsRepo: repo });
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(String(get.body)).payload).toEqual(payload);
  });
});
