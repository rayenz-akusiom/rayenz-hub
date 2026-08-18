import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createHubClient,
  HubApiError,
  loadHubConfigFromEnv,
} from '../../../packages/mcp/src/hub-client.ts';

const sessionConfig = {
  url: 'http://api.test',
  username: 'Rayenz',
  password: 'secret',
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

function withSignIn(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/v1/auth/sign-in')) {
      return jsonRes({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        username: 'Rayenz',
        sub: 'rayenz-sub',
        expiresIn: 3600,
      });
    }
    return handler(url, init);
  });
}

describe('mcp hub-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadHubConfigFromEnv requires url, username, and password', () => {
    expect(() => loadHubConfigFromEnv({})).toThrow(/HUB_API_URL/);
    expect(() => loadHubConfigFromEnv({ HUB_API_URL: 'http://x' })).toThrow(/HUB_USERNAME/);
    expect(() => loadHubConfigFromEnv({ HUB_API_URL: 'http://x', HUB_USERNAME: 'Rayenz' })).toThrow(
      /HUB_PASSWORD/,
    );
    expect(
      loadHubConfigFromEnv({
        HUB_API_URL: 'http://x/',
        HUB_USERNAME: 'Rayenz',
        HUB_PASSWORD: 'secret',
      }),
    ).toEqual({
      url: 'http://x',
      username: 'Rayenz',
      password: 'secret',
    });
  });

  it('returns null on 404 by default', async () => {
    vi.stubGlobal('fetch', withSignIn(() => jsonRes('missing', 404)));
    const client = createHubClient(sessionConfig);
    await expect(client.getDeck('d1')).resolves.toBeNull();
  });

  it('throws HubApiError on non-404 failures', async () => {
    vi.stubGlobal('fetch', withSignIn(() => jsonRes('nope', 500)));
    const client = createHubClient(sessionConfig);
    await expect(client.listDecks()).rejects.toBeInstanceOf(HubApiError);
  });

  it('signs in then sends Bearer access token', async () => {
    const fetchMock = withSignIn((_url, init) => {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer access-token',
      });
      return jsonRes({ decks: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createHubClient(sessionConfig);
    await expect(client.listDecks()).resolves.toEqual({ decks: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/auth/sign-in',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/decks',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('refreshes once on 401 then retries', async () => {
    let decksCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/sign-in')) {
        return jsonRes({
          accessToken: 'expired',
          refreshToken: 'refresh-token',
          username: 'Rayenz',
          sub: 'rayenz-sub',
          expiresIn: 3600,
        });
      }
      if (url.endsWith('/v1/auth/refresh')) {
        return jsonRes({
          accessToken: 'fresh',
          refreshToken: 'refresh-token',
          username: 'Rayenz',
          sub: 'rayenz-sub',
          expiresIn: 3600,
        });
      }
      decksCalls += 1;
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth === 'Bearer expired') {
        return jsonRes('denied', 401);
      }
      return jsonRes({ decks: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createHubClient(sessionConfig);
    await expect(client.listDecks()).resolves.toEqual({ decks: [] });
    expect(decksCalls).toBe(2);
  });

  it('patchDeck sends PATCH with body', async () => {
    const fetchMock = withSignIn((_url, init) => {
      expect(init?.method).toBe('PATCH');
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Renamed' });
      return jsonRes({ deckId: 'd1', name: 'Renamed' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createHubClient(sessionConfig);
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
    vi.stubGlobal('fetch', withSignIn(() => jsonRes('<!doctype html>')));
    const client = createHubClient({ url: 'http://web.test', username: 'Rayenz', password: 'secret' });
    await expect(client.listDecks()).rejects.toThrow(/HTML/);
  });
});
