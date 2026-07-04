import { describe, expect, it } from 'vitest';
import { buildHubDom, loadHubModule, resetDom } from '../helpers/hubHarness.js';
import { setupHub } from '../helpers/hubHarness.js';

function flushPromises() {
   return new Promise((resolve) => {
      setTimeout(resolve, 0);
   });
}

describe('hub router', () => {
   it('defaults empty hash to the dailies route', async () => {
      const hub = await setupHub();
      expect(hub.getRoutePath()).toBe('/dailies');
      expect(hub.getLinkTiles().length).toBeGreaterThan(0);
   });

   it('navigates to deck review and back', async () => {
      const hub = await setupHub();
      await hub.navigate('#/deck-review');
      expect(hub.getRoutePath()).toBe('/deck-review');
      expect(document.querySelector('.deck-review-stub')).toBeTruthy();

      await hub.navigate('#/dailies');
      expect(hub.getRoutePath()).toBe('/dailies');
      expect(hub.getLinkTiles().length).toBeGreaterThan(0);
   });

   it('loads deck review once when navigate sets hash programmatically', async () => {
      resetDom();
      buildHubDom();
      loadHubModule('shared/storage.js');
      loadHubModule('shared/router.js');

      let reviewLoads = 0;
      HubRouter.registerRoute('/deck-suggest', async (root) => {
         root.innerHTML = '<div class="deck-suggest-stub"></div>';
      });
      HubRouter.registerRoute('/deck-review', async (root) => {
         reviewLoads += 1;
         root.innerHTML = '<div class="deck-review-stub"></div>';
      });
      HubRouter.registerRoute('/dailies', async (root) => {
         root.innerHTML = '<div class="dailies-stub"></div>';
      });

      window.location.hash = '#/deck-suggest';
      HubRouter.init();
      await flushPromises();

      reviewLoads = 0;
      await HubRouter.navigate('#/deck-review');
      await flushPromises();

      expect(reviewLoads).toBe(1);
      expect(document.querySelector('.deck-review-stub')).toBeTruthy();
   });
});
