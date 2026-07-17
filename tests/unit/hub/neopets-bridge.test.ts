import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bridgeFetch,
  hasItemdbBridge,
  hasNeopetsBridge,
  neopetsFetch,
  neopetsPost,
} from '../../../packages/web/src/lib/neopets-bridge.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';

type BridgeWindow = Window & {
  __neopetsFetch?: (url: string) => Promise<{ text: string; status: number; url?: string } | string>;
  __neopetsPost?: (
    url: string,
    body: string,
    headers?: Record<string, string>,
  ) => Promise<{ text: string; status: number; url?: string } | string>;
  __bridgeFetch?: (url: string, options?: RequestInit) => Promise<Response>;
};

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  const w = window as BridgeWindow;
  delete w.__neopetsFetch;
  delete w.__neopetsPost;
  delete w.__bridgeFetch;
  resetHubModules();
});

describe('neopets bridge detection', () => {
  it('reports false when bridge functions are absent', () => {
    expect(hasNeopetsBridge()).toBe(false);
    expect(hasItemdbBridge()).toBe(false);
  });

  it('reports true when bridge functions exist', () => {
    (window as BridgeWindow).__neopetsFetch = async () => ({ text: 'ok', status: 200 });
    (window as BridgeWindow).__bridgeFetch = async () => new Response('ok');
    expect(hasNeopetsBridge()).toBe(true);
    expect(hasItemdbBridge()).toBe(true);
  });
});

describe('neopetsFetch and neopetsPost', () => {
  it('throws when userscript bridge is missing', async () => {
    await expect(neopetsFetch('https://neopets.com/')).rejects.toThrow(/Install the Rayenz Dailies userscript/);
    await expect(neopetsPost('https://neopets.com/', 'a=1')).rejects.toThrow(/Install the Rayenz Dailies userscript/);
  });

  it('normalizes object and string bridge responses', async () => {
    (window as BridgeWindow).__neopetsFetch = async (url) => ({ text: 'html', status: 200, url });
    await expect(neopetsFetch('https://neopets.com/page')).resolves.toEqual({
      text: 'html',
      status: 200,
      url: 'https://neopets.com/page',
    });

    (window as BridgeWindow).__neopetsFetch = async () => 'plain text';
    await expect(neopetsFetch('https://neopets.com/')).resolves.toEqual({
      text: 'plain text',
      status: 0,
      url: '',
    });

    (window as BridgeWindow).__neopetsPost = async (url, body, headers) => ({
      text: body,
      status: 201,
      url: url + (headers?.['X-Test'] ?? ''),
    });
    await expect(neopetsPost('https://neopets.com/post', 'foo=bar', { 'X-Test': '1' })).resolves.toEqual({
      text: 'foo=bar',
      status: 201,
      url: 'https://neopets.com/post1',
    });

    (window as BridgeWindow).__neopetsPost = async () => 'posted';
    await expect(neopetsPost('https://neopets.com/', 'x')).resolves.toEqual({
      text: 'posted',
      status: 0,
      url: '',
    });
  });
});

describe('bridgeFetch', () => {
  it('delegates to __bridgeFetch when installed', async () => {
    const bridgeFn = vi.fn(async () => new Response('from-bridge', { status: 200 }));
    (window as BridgeWindow).__bridgeFetch = bridgeFn;
    const res = await bridgeFetch('https://itemdb.com.br/api', { method: 'GET' });
    expect(bridgeFn).toHaveBeenCalledWith('https://itemdb.com.br/api', { method: 'GET' });
    expect(await res.text()).toBe('from-bridge');
  });

  it('falls back to global fetch when bridge absent', async () => {
    const fetchMock = vi.fn(async () => new Response('direct', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await bridgeFetch('https://example.com/data');
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/data', undefined);
    expect(await res.text()).toBe('direct');
  });
});
