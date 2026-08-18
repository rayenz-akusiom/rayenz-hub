import { beforeAll, describe, expect, it } from 'vitest';

const baseUrl = (process.env.HUB_API_URL || '').replace(/\/$/, '');
const username = process.env.HUB_USERNAME || '';
const password = process.env.HUB_PASSWORD || '';

const describeDeployed = baseUrl && username && password ? describe : describe.skip;

let accessToken = '';

async function signIn(): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`sign-in failed (${res.status})`);
  }
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) {
    throw new Error('sign-in response missing accessToken');
  }
  return body.accessToken;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

describeDeployed('deployed API contract', () => {
  beforeAll(async () => {
    accessToken = await signIn();
  });

  it('GET /v1/health is public', async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: 'v1' });
  });

  it('GET /v1/settings/dailies requires auth', async () => {
    const res = await fetch(`${baseUrl}/v1/settings/dailies`);
    expect(res.status).toBe(401);
  });

  it('round-trips dailies settings', async () => {
    const payload = { faerieQuest: 'illusen', schools: { battledome: true } };
    const put = await fetch(`${baseUrl}/v1/settings/dailies`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ payload }),
    });
    expect(put.status).toBe(200);

    const get = await fetch(`${baseUrl}/v1/settings/dailies`, { headers: authHeaders() });
    expect(get.status).toBe(200);
    const body = await get.json();
    expect(body.payload).toEqual(payload);
  });
});
