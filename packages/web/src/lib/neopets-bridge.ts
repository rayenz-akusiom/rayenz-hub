/**
 * Userscript bridges live on the top hub window. Settings/Dailies run in
 * same-origin iframes and reach them via parent.
 */

export type NeopetsBridgeResponse = {
  text: string;
  status: number;
  url?: string;
};

type BridgeHost = Window & {
  __neopetsFetch?: (url: string) => Promise<NeopetsBridgeResponse | string>;
  __neopetsPost?: (
    url: string,
    body: string,
    headers?: Record<string, string>,
  ) => Promise<NeopetsBridgeResponse | string>;
  __bridgeFetch?: (url: string, options?: RequestInit) => Promise<Response>;
};

function host(): BridgeHost {
  try {
    if (window.parent && window.parent !== window) {
      return window.parent as BridgeHost;
    }
  } catch {
    /* cross-origin */
  }
  return window as BridgeHost;
}

export function hasNeopetsBridge(): boolean {
  return typeof host().__neopetsFetch === 'function';
}

export function hasItemdbBridge(): boolean {
  return typeof host().__bridgeFetch === 'function';
}

export async function neopetsFetch(url: string): Promise<NeopetsBridgeResponse> {
  const fn = host().__neopetsFetch;
  if (typeof fn !== 'function') {
    throw new Error('Install the Rayenz Dailies userscript for Neopets access.');
  }
  const result = await fn(url);
  if (typeof result === 'string') {
    return { text: result, status: 0, url: '' };
  }
  return result;
}

export async function neopetsPost(
  url: string,
  body: string,
  headers?: Record<string, string>,
): Promise<NeopetsBridgeResponse> {
  const fn = host().__neopetsPost;
  if (typeof fn !== 'function') {
    throw new Error('Install the Rayenz Dailies userscript for Neopets access.');
  }
  const result = await fn(url, body, headers);
  if (typeof result === 'string') {
    return { text: result, status: 0, url: '' };
  }
  return result;
}

export async function bridgeFetch(url: string, options?: RequestInit): Promise<Response> {
  const fn = host().__bridgeFetch;
  if (typeof fn === 'function') {
    return fn(url, options);
  }
  return fetch(url, options);
}
