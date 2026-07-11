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
   'ArchidektExport',
   'OrderReconcileExport',
   'OrderEmailParse',
   'HubCardPicker',
   'ProfileSync',
   'OrderReconcile',
   'DeckReview',
   'DeckSuggest',
   'SwapQueue',
   'ScryfallCache',
   'HubProgress',
];

// Loads one or more hub IIFE files (in dependency order) into the happy-dom
// window and returns the resulting `window.<globalName>` export. Each entry is
// a path relative to rayenz-hub/; the last loaded module's global is returned
// when `globalName` is omitted (best-effort) — prefer passing it explicitly.
export function loadHubModule(relPaths, globalName) {
   const list = Array.isArray(relPaths) ? relPaths : [relPaths];
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
   const dailiesHtml = readHubFile('apps/dailies/dailies.html');

   return vi.fn(async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('dailies.html')) {
         return {
            ok: true,
            text: () => Promise.resolve(dailiesHtml),
         };
      }
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

function flushPromises() {
   return new Promise((resolve) => {
      setTimeout(resolve, 0);
   });
}

export function loadHubScripts() {
   runInWindow(readHubFile('shared/storage.js'));
   runInWindow(readHubFile('shared/hub-utils.js'));
   runInWindow(readHubFile('shared/hub-progress.js'));
   runInWindow(readHubFile('shared/router.js'));
   runInWindow(readHubFile('apps/dailies/dailies-settings.js'));
   runInWindow(readHubFile('apps/dailies/dailies-links.js'));
   runInWindow(readHubFile('apps/dailies/dailies-timed.js'));
   runInWindow(readHubFile('apps/dailies/dailies-itemdb.js'));
   runInWindow(readHubFile('apps/dailies/dailies-wishing-well.js'));
   runInWindow(readHubFile('apps/dailies/dailies-render.js'));
   runInWindow(readHubFile('apps/dailies/dailies.js'));
   window.__dailiesScriptLoaded = true;
   window.__dailiesModulesLoaded = true;
   runInWindow(readHubFile('apps/dailies/load.js'));
}

export async function setupHub(options = {}) {
   resetDom();
   buildHubDom();
   global.fetch = mockFetch();
   window.location.hash = options.initialHash || '';

   loadHubScripts();

   window.HubRouter.registerRoute('/dailies', window.loadDailiesApp);
   window.HubRouter.registerRoute('/deck-review', options.deckReviewLoader || (async (root) => {
      root.innerHTML = '<div class="deck-review-stub">Deck Review</div>';
   }));

   window.HubRouter.init();
   await flushPromises();

   if (options.initialHash !== '#/deck-review') {
      await waitForDailiesReady();
   }

   return {
      navigate: async (hash) => {
         const normalized = hash.startsWith('#') ? hash : '#' + hash;
         if (window.location.hash !== normalized) {
            window.location.hash = normalized;
         }
         else {
            await window.HubRouter.navigate(normalized, { force: true });
         }
         await flushPromises();
         if (normalized === '#/dailies') {
            await waitForDailiesReady();
         }
      },
      getLinkTiles: () => Array.from(document.querySelectorAll('#app-root .daily-tile')),
      getRoutePath: () => window.HubRouter.getRoutePath(),
   };
}

async function waitForDailiesReady(attempts = 50) {
   for (let i = 0; i < attempts; i++) {
      const grid = document.querySelector('#app-root .dailies-grid');
      if (grid && grid.querySelector('.daily-tile')) {
         return grid;
      }
      await flushPromises();
   }
   throw new Error('Timed out waiting for dailies init (daily-tile)');
}
