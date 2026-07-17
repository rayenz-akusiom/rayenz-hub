import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

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
  delete (window as Window & { __hubReviewHandoff?: unknown }).__hubReviewHandoff;
  MODULE_GLOBALS.forEach((name) => {
    delete (window as unknown as Record<string, unknown>)[name];
  });
  delete (window as Window & { StringUtils?: unknown }).StringUtils;
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
    '<li><a class="hub-nav-link" href="#/deck-review">Deck Review</a></li>' +
    '</ul>' +
    '</nav>' +
    '<main class="hub-main">' +
    '<div id="app-root"></div>' +
    '</main>' +
    '</div>';
}

export function mockFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    const requestUrl = String(url);
    if (requestUrl.includes('latest.json')) {
      return {
        ok: false,
        status: 404,
        text: () => Promise.resolve(''),
      };
    }
    return {
      ok: false,
      text: () => Promise.resolve(''),
    };
  });
}

/** @deprecated Shared core is TypeScript — call installHubGlobals() when globals are needed. */
export function loadHubScripts(): void {}
