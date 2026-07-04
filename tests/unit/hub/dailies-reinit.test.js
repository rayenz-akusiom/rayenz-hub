import { describe, expect, it } from 'vitest';
import { setupHub } from '../helpers/hubHarness.js';

describe('dailies re-init after navigation', () => {
   it('re-renders link grid after returning from deck review', async () => {
      const hub = await setupHub();
      const firstTile = hub.getLinkTiles()[0];

      expect(firstTile).toBeTruthy();

      await hub.navigate('#/deck-review');
      await hub.navigate('#/dailies');

      const afterReturn = hub.getLinkTiles()[0];
      expect(afterReturn).toBeTruthy();
      expect(afterReturn).not.toBe(firstTile);
      expect(document.querySelector('#app-root .dailies-grid')).toBeTruthy();
   });

   it('renders sidebar with pet name and collapsible sections', async () => {
      const hub = await setupHub();
      await hub.navigate('#/dailies');

      const sidebar = document.querySelector('#dailies-books');
      expect(sidebar).toBeTruthy();
      expect(sidebar.querySelector('[data-link-id="main-pet"]')).toBeTruthy();
      expect(sidebar.querySelectorAll('.collapsible').length).toBeGreaterThanOrEqual(3);
      expect(document.querySelector('.dailies-wishlists-section')).toBeTruthy();
      expect(document.querySelector('.dailies-dailies-section')).toBeTruthy();
      expect(document.querySelector('.dailies-automated-section')).toBeTruthy();

      const mainCol = document.querySelector('#dailies-links');
      expect(mainCol.querySelector('[data-link-id="gourmet-club"]')).toBeFalsy();
      expect(sidebar.querySelector('[data-link-id="gourmet-club"]')).toBeTruthy();

      const myAlbumsBtn = Array.from(sidebar.querySelectorAll('.collapsible')).find(
         (btn) => btn.textContent === 'My Albums'
      );
      expect(myAlbumsBtn).toBeTruthy();
   });

   it('renders dailies shell immediately with loading wishlist placeholders', async () => {
      const hub = await setupHub();
      await hub.navigate('#/dailies');

      const mainCol = document.querySelector('#dailies-links');
      const sidebar = document.querySelector('#dailies-books');
      expect(mainCol).toBeTruthy();
      expect(sidebar).toBeTruthy();
      expect(mainCol.querySelector('.dailies-dailies-section .daily-tile')).toBeTruthy();
      expect(sidebar.querySelector('.daily-tile')).toBeTruthy();
      expect(mainCol.querySelector('.dailies-wishlists-section')).toBeTruthy();

      const loadingNote = mainCol.querySelector('.dailies-wishlists-section .text-small');
      if (loadingNote) {
         expect(loadingNote.textContent).toMatch(/Loading|Set ItemDB key|List link/);
      }
   });

   it('toggles collapsible sections after route return', async () => {
      const hub = await setupHub();
      await hub.navigate('#/deck-review');
      await hub.navigate('#/dailies');

      const collapsible = document.querySelector('#dailies-books .collapsible');
      const content = collapsible && collapsible.nextElementSibling;
      expect(collapsible).toBeTruthy();
      expect(content).toBeTruthy();
      expect(collapsible.classList.contains('active')).toBe(false);
      expect(content.classList.contains('active')).toBe(false);

      collapsible.click();
      expect(collapsible.classList.contains('active')).toBe(true);
      expect(content.classList.contains('active')).toBe(true);

      collapsible.click();
      expect(collapsible.classList.contains('active')).toBe(false);
      expect(content.classList.contains('active')).toBe(false);
   });
});
