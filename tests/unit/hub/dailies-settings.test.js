import { describe, expect, it, beforeEach } from 'vitest';
import { readHubFile, runInWindow } from '../helpers/hubHarness.js';

describe('dailies settings filters', () => {
   beforeEach(() => {
      runInWindow(readHubFile('shared/storage.js'));
      runInWindow(readHubFile('apps/dailies/dailies-settings.js'));
      runInWindow(readHubFile('apps/dailies/dailies-links.js'));
   });

   it('shows only selected faerie quest link', () => {
      const settings = { faerieQuest: 'illusen', schools: {} };
      const ids = window.DailiesLinks.getFilteredLinks(settings).map((l) => l.id);
      expect(ids).toContain('illusen');
      expect(ids).not.toContain('jhudora');
   });

   it('filters disabled training schools', () => {
      const settings = {
         faerieQuest: 'illusen',
         schools: { swashbuckling: false, battledome: true }
      };
      const ids = window.DailiesLinks.getFilteredLinks(settings).map((l) => l.id);
      expect(ids).not.toContain('swashbuckling');
      expect(ids).toContain('battledome');
   });

   it('parses ItemDB list URLs', () => {
      const parsed = window.DailiesSettings.parseItemDbListUrl(
         'https://itemdb.com.br/lists/rayenz/gourmet-food-checklist'
      );
      expect(parsed).toEqual({ user: 'rayenz', slug: 'gourmet-food-checklist' });
   });

   it('returns default wishlists when settings omit wishlists', () => {
      const wishlists = window.DailiesSettings.getWishlists({ faerieQuest: 'illusen' });
      expect(wishlists).toHaveLength(4);
      expect(wishlists[0].slug).toBe('all-collectibles-checklist');
      expect(wishlists[0].user).toBe('rayenz');
   });

   it('uses saved wishlists from settings', () => {
      const wishlists = window.DailiesSettings.getWishlists({
         wishlists: [{
            label: 'Custom',
            listUrl: 'https://itemdb.com.br/lists/testuser/my-list',
            img: 'https://example/icon.gif'
         }]
      });
      expect(wishlists).toHaveLength(1);
      expect(wishlists[0].label).toBe('Custom');
      expect(wishlists[0].user).toBe('testuser');
      expect(wishlists[0].slug).toBe('my-list');
   });
});
