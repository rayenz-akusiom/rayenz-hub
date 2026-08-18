import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, vi } from 'vitest';
import { installHubGlobals, resetHubGlobalsInstalled } from '../../../packages/web/src/hub/install-hub-globals.ts';
import { __resetHubStorageMemoryForTests } from '../../../packages/web/src/lib/hub-storage.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const HUB_ROOT = path.join(REPO_ROOT, 'rayenz-hub');

export function readHubFile(relativePath: string): string {
  return fs.readFileSync(path.join(HUB_ROOT, relativePath), 'utf8');
}

/** @deprecated Vanilla IIFE loading removed — use TypeScript imports. */
export function runInWindow(_code: string): void {
  throw new Error('runInWindow is no longer supported; import TypeScript modules instead');
}

const MODULE_GLOBALS = [
  'HubUtils',
  'HubStorage',
  'HubApiClient',
  'ArchidektExport',
  'OrderReconcileExport',
  'OrderEmailParse',
  'HubCardPicker',
  'ProfileSync',
  'OrderReconcile',
  'DeckReview',
  'DeckSuggest',
  'SwapQueue',
  'SuggestionsBundle',
  'CutCandidates',
  'ScryfallCache',
  'HubProgress',
] as const;

/** @deprecated Use TypeScript imports instead of loading hub IIFE files. */
export function loadHubModule(_relPaths: string | string[], _globalName?: string): unknown {
  throw new Error('loadHubModule is no longer supported; import TypeScript modules instead');
}

export function resetHubModules(): void {
  localStorage.clear();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  MODULE_GLOBALS.forEach((name) => {
    delete (window as unknown as Record<string, unknown>)[name];
  });
  delete (window as Window & { StringUtils?: unknown }).StringUtils;
  __resetHubStorageMemoryForTests();
}

export function resetDom(): void {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  localStorage.clear();

  delete (window as Window & { HubRouter?: unknown }).HubRouter;
  delete (window as Window & { HubStorage?: unknown }).HubStorage;
}

export function buildHubDom(): void {
  document.body.innerHTML =
    '<button type="button" id="hub-nav-toggle" class="hub-nav-toggle" aria-label="Open menu"></button>' +
    '<div id="hub-nav-backdrop" class="hub-nav-backdrop"></div>' +
    '<div class="hub-layout">' +
    '<nav id="hub-nav" class="hub-nav" aria-label="Apps">' +
    '<ul class="hub-nav-list">' +
    '<li><a class="hub-nav-link" href="#/dailies">Dailies</a></li>' +
    '<li><a class="hub-nav-link" href="#/deck-suggest">Deck Suggest</a></li>' +
    '</ul>' +
    '</nav>' +
    '<main class="hub-main">' +
    '<div id="app-root"></div>' +
    '</main>' +
    '</div>';
}

/** Fetch Response-like mock for Hub API clients (uses res.text(), not res.json()). */
export function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const text = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    ok,
    text: async () => text,
    json: async () => (typeof body === 'string' ? JSON.parse(body || 'null') : body),
  };
}

/** Enable Hub API URL + a login session for dual-mode tests. */
export function enableHubApi(
  url = 'http://127.0.0.1:3000',
  accessToken = 'test-access-token',
): void {
  localStorage.setItem('rayenz-hub-api-url', url);
  localStorage.removeItem('rayenz-hub-api-key');
  localStorage.setItem('rayenz-hub-access-token', accessToken);
}

/** @deprecated Prefer enableHubApi */
export const enableApi = enableHubApi;

/** Standard beforeEach/afterEach for Hub API + globals suites. */
export function installHubApiGlobalsLifecycle(): void {
  beforeEach(() => {
    resetHubModules();
    resetHubGlobalsInstalled();
    installHubGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetHubModules();
    resetHubGlobalsInstalled();
  });
}

/** @deprecated Shared core is TypeScript — call installHubGlobals() when globals are needed. */
export function loadHubScripts(): void {}
