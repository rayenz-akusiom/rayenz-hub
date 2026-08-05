import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createHubClient,
  HubApiError,
  loadHubConfigFromEnv,
} from '../../../packages/mcp/src/hub-client.ts';

describe('mcp hub-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadHubConfigFromEnv requires url and key', () => {
    expect(() => loadHubConfigFromEnv({})).toThrow(/HUB_API_URL/);
    expect(() => loadHubConfigFromEnv({ HUB_API_URL: 'http://x' })).toThrow(/HUB_API_KEY/);
    expect(loadHubConfigFromEnv({ HUB_API_URL: 'http://x/', HUB_API_KEY: 'k' })).toEqual({
      url: 'http://x',
      key: 'k',
    });
  });

  it('returns null on 404 by default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 })),
    );
    const client = createHubClient({ url: 'http://api.test', key: 'secret' });
    await expect(client.getDeck('d1')).resolves.toBeNull();
  });

  it('throws HubApiError on non-404 failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    const client = createHubClient({ url: 'http://api.test', key: 'secret' });
    await expect(client.listDecks()).rejects.toBeInstanceOf(HubApiError);
  });

  it('sends Bearer auth and parses JSON', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer secret',
      });
      return new Response(JSON.stringify({ decks: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createHubClient({ url: 'http://api.test', key: 'secret' });
    await expect(client.listDecks()).resolves.toEqual({ decks: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/decks',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('patchDeck sends PATCH with body', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('PATCH');
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Renamed' });
      return new Response(JSON.stringify({ deckId: 'd1', name: 'Renamed' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createHubClient({ url: 'http://api.test', key: 'secret' });
    await expect(client.patchDeck('d1', { name: 'Renamed' })).resolves.toEqual({
      deckId: 'd1',
      name: 'Renamed',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/decks/d1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('rejects HTML bodies that look like wrong API URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html>', { status: 200 })),
    );
    const client = createHubClient({ url: 'http://web.test', key: 'secret' });
    await expect(client.listDecks()).rejects.toThrow(/HTML/);
  });
});
