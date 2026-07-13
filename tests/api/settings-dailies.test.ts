import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsRepository } from '../../packages/api/src/repositories/settings-repository.ts';
import { handleSettings } from '../../packages/api/src/handlers/settings.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';

const API_KEY = 'test-api-key-local';
const AUTH_HEADERS = { authorization: `Bearer ${API_KEY}` };

describe('settings dailies API', () => {
  let memory: MemoryDocClient;
  let repo: SettingsRepository;

  beforeEach(() => {
    process.env.HUB_API_KEY = API_KEY;
    process.env.HUB_USER_ID = 'default';
    process.env.HUB_TABLE_NAME = 'HubTable';
    delete process.env.DYNAMODB_ENDPOINT;
    memory = new MemoryDocClient();
    repo = new SettingsRepository(memory, 'HubTable');
  });

  afterEach(() => {
    delete process.env.HUB_API_KEY;
    delete process.env.HUB_USER_ID;
    delete process.env.HUB_TABLE_NAME;
  });

  it('returns 401 without API key', async () => {
    const result = await handleSettings('PUT', 'dailies', {}, JSON.stringify({ payload: { wishlists: [] } }));
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(String(result.body)).error).toBe('Unauthorized');
  });

  it('returns 401 with invalid API key', async () => {
    const result = await handleSettings(
      'GET',
      'dailies',
      { authorization: 'Bearer wrong-key' },
      null,
      { settingsRepo: repo },
    );
    expect(result.statusCode).toBe(401);
  });

  it('round-trips dailies settings via repository partition keys', async () => {
    const payload = { wishlists: [{ id: 'books', label: 'Books' }], schools: { battledome: true } };
    const putResult = await handleSettings(
      'PUT',
      'dailies',
      AUTH_HEADERS,
      JSON.stringify({ payload }),
      { settingsRepo: repo },
    );
    expect(putResult.statusCode).toBe(200);
    const putBody = JSON.parse(String(putResult.body));
    expect(putBody.domain).toBe('dailies');
    expect(putBody.payload).toEqual(payload);

    const getResult = await handleSettings(
      'GET',
      'dailies',
      AUTH_HEADERS,
      null,
      { settingsRepo: repo },
    );
    expect(getResult.statusCode).toBe(200);
    expect(JSON.parse(String(getResult.body)).payload).toEqual(payload);

    const stored = [...memory.snapshot().values()][0];
    expect(stored.PK).toBe('USER::default');
    expect(stored.SK).toBe('SETTINGS::DAILIES');
  });

  it('returns 404 when settings are missing', async () => {
    const result = await handleSettings('GET', 'dailies', AUTH_HEADERS, null, { settingsRepo: repo });
    expect(result.statusCode).toBe(404);
  });
});
