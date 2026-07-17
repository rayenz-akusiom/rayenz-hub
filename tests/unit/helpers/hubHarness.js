import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const HUB_ROOT = path.join(REPO_ROOT, 'rayenz-hub');

export function readHubFile(relativePath) {
   return fs.readFileSync(path.join(HUB_ROOT, relativePath), 'utf8');
}

export function runInWindow(code) {
   const fn = new Function(code);
   fn.call(window);
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
];

// Loads one or more hub IIFE files (in dependency order) into the happy-dom
// window and returns the resulting `window.<globalName>` export. Each entry is
// a path relative to rayenz-hub/; the last loaded module's global is returned
// when `globalName` is omitted (best-effort) — prefer passing it explicitly.
export function loadHubModule(relPaths, globalName) {
   const list = Array.isArray(relPaths) ? relPaths : [relPaths];
   // HubUtils binds StringUtils.escapeHtml at load time.
   if (list.some((p) => p.includes('hub-utils.js')) && !window.StringUtils) {
      runInWindow(readHubFile('shared/string-utils.js'));
   }
   list.forEach((relPath) => runInWindow(readHubFile(relPath)));
   return globalName ? window[globalName] : undefined;
}

export function resetHubModules() {
   localStorage.clear();
   try {
      sessionStorage.clear();
   } catch (e) {
      /* ignore */
   }
   delete window.__hubReviewHandoff;
   MODULE_GLOBALS.forEach((name) => {
      delete window[name];
   });
   delete window.StringUtils;
}

export function resetDom() {
   document.head.innerHTML = '';
   document.body.innerHTML = '';
   localStorage.clear();

   delete window.HubRouter;
   delete window.HubStorage;
   delete window.loadDailiesApp;
   delete window.__initDailiesApp;
   delete window.__dailiesScriptLoaded;
}

export function buildHubDom() {
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
   return vi.fn(async (url) => {
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

export function loadHubScripts() {
   runInWindow(readHubFile('shared/storage.js'));
   runInWindow(readHubFile('shared/string-utils.js'));
   runInWindow(readHubFile('shared/hub-utils.js'));
   runInWindow(readHubFile('shared/hub-progress.js'));
}
