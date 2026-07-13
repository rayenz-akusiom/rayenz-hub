import { describe, expect, it } from 'vitest';

const baseUrl = (process.env.HUB_API_URL || '').replace(/\/$/, '');
const apiKey = process.env.HUB_API_KEY || '';
const authHeaders = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
};

const describeDeployed = baseUrl && apiKey ? describe : describe.skip;

describeDeployed('deployed API contract', () => {
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
      headers: authHeaders,
      body: JSON.stringify({ payload }),
    });
    expect(put.status).toBe(200);

    const get = await fetch(`${baseUrl}/v1/settings/dailies`, { headers: authHeaders });
    expect(get.status).toBe(200);
    const body = await get.json();
    expect(body.payload).toEqual(payload);
  });
});
