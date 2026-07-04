import { describe, expect, it, beforeEach } from 'vitest';
import { readHubFile, runInWindow } from '../helpers/hubHarness.js';

describe('dailies wishlist cards', () => {
   beforeEach(() => {
      runInWindow(readHubFile('shared/storage.js'));
      runInWindow(readHubFile('shared/hub-utils.js'));
      runInWindow(readHubFile('apps/dailies/dailies-settings.js'));
      runInWindow(readHubFile('apps/dailies/dailies-links.js'));
      runInWindow(readHubFile('apps/dailies/dailies-render.js'));
   });

   it('renders full-width wishlist card with SSW link and price', () => {
      const html = window.DailiesRender.renderWishlistCard({
         list: {
            id: 'books-checklist',
            label: 'Books',
            listUrl: 'https://itemdb.com.br/lists/rayenz/book-award-checklist-2',
            slug: 'book-award-checklist-2',
            user: 'rayenz',
            img: 'https://images.neopets.com/items/boo_test.gif'
         },
         item: {
            name: 'Cheap Book',
            description: 'A very cheap book for testing.',
            image: 'https://images.neopets.com/items/boo_cheap.gif',
            price: { value: 1500 },
            findAt: { shopWizard: 'https://www.neopets.com/shops/wizard.phtml?string=Cheap+Book' }
         },
         error: null
      });

      expect(html).toContain('wishlist-card');
      expect(html).toContain('Cheap Book');
      expect(html).toContain('A very cheap book for testing.');
      expect(html).toContain('1,500 NP');
      expect(html).toContain('https://www.neopets.com/shops/wizard.phtml?string=Cheap+Book');
      expect(html).toContain('wishlist-card-item-image');
      expect(html).toContain('data-wishlist-next');
      expect(html).toContain('Next item</button>');
      expect(html).toContain('Hide on ItemDB</a>');
      expect(html).toContain('https://itemdb.com.br/lists/rayenz/book-award-checklist-2');
   });

   it('shows cache hint when cachedAt is present', () => {
      runInWindow(readHubFile('apps/dailies/dailies-itemdb.js'));
      const html = window.DailiesRender.renderWishlistCard({
         list: {
            id: 'books-checklist',
            label: 'Books',
            listUrl: 'https://itemdb.com.br/lists/rayenz/book-award-checklist-2',
            slug: 'book-award-checklist-2',
            user: 'rayenz',
            img: 'https://images.neopets.com/items/boo_test.gif'
         },
         item: {
            internal_id: 42,
            name: 'Cheap Book',
            description: 'A very cheap book for testing.',
            image: 'https://images.neopets.com/items/boo_cheap.gif',
            price: { value: 1500 },
            findAt: { shopWizard: 'https://www.neopets.com/shops/wizard.phtml?string=Cheap+Book' }
         },
         error: null,
         cachedAt: Date.now() - 2 * 60 * 60 * 1000
      });

      expect(html).toContain('wishlist-cache-hint');
      expect(html).toContain('Cached 2h ago');
   });

   it('formats NP prices for display', () => {
      expect(window.DailiesRender.formatNpPrice(22450)).toBe('22,450 NP');
      expect(window.DailiesRender.formatNpPrice(null)).toBeNull();
   });

   it('shows no-bridge message on wishlist card', () => {
      const html = window.DailiesRender.renderWishlistCard({
         list: {
            id: 'books-checklist',
            label: 'Books',
            listUrl: 'https://itemdb.com.br/lists/rayenz/book-award-checklist-2',
            slug: 'book-award-checklist-2',
            user: 'rayenz',
            img: 'https://images.neopets.com/items/boo_test.gif'
         },
         item: null,
         error: 'no-bridge'
      });
      expect(html).toContain('Install the Rayenz Dailies userscript');
   });

   it('shows session expired message on wishlist card', () => {
      const html = window.DailiesRender.renderWishlistCard({
         list: {
            id: 'books-checklist',
            label: 'Books',
            listUrl: 'https://itemdb.com.br/lists/rayenz/book-award-checklist-2',
            slug: 'book-award-checklist-2',
            user: 'rayenz',
            img: 'https://images.neopets.com/items/boo_test.gif'
         },
         item: null,
         error: 'ItemDB session expired — visit itemdb.com.br (log in if needed), then refresh'
      });
      expect(html).toContain('session expired');
      expect(html).toContain('itemdb.com.br');
   });

   it('renders loading placeholders via itemdbTargets', () => {
      const html = window.DailiesRender.renderWishlistsSection([
         {
            list: {
               id: 'books-checklist',
               label: 'Books',
               listUrl: 'https://itemdb.com.br/lists/rayenz/book-award-checklist-2',
               slug: 'book-award-checklist-2',
               user: 'rayenz',
               img: 'https://images.neopets.com/items/boo_test.gif'
            },
            item: null,
            error: 'loading'
         }
      ]);
      expect(html).toContain('Loading…');
   });
});
