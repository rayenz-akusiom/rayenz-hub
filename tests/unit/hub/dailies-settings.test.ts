import { describe, expect, it, beforeEach, vi } from 'vitest';
import * as DailiesSettings from '../../../packages/web/src/dailies/settings.ts';
import * as DailiesTimed from '../../../packages/web/src/dailies/timed.ts';
import * as DailiesWishingWell from '../../../packages/web/src/dailies/wishing-well.ts';
import { installDailiesGlobals } from './installDailiesGlobals.ts';

describe('dailies settings filters', () => {
   beforeEach(() => {
      installDailiesGlobals();
      const blob = {};
      window.HubStorage = {
         loadDailiesSettings: () => ({ ...blob }),
         saveDailiesSettings: (settings) => {
            Object.keys(blob).forEach((k) => delete blob[k]);
            Object.assign(blob, settings);
         },
      };
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

   it('normalizes wishlists on save', () => {
      window.DailiesSettings.saveSettings({
         faerieQuest: 'illusen',
         schools: {},
         wishlists: [{
            label: 'Custom',
            listUrl: 'https://itemdb.com.br/lists/testuser/my-list',
            img: 'https://example/icon.gif'
         }]
      });
      const saved = window.HubStorage.loadDailiesSettings();
      expect(saved.wishlists[0].user).toBe('testuser');
      expect(saved.wishlists[0].slug).toBe('my-list');
      expect(saved.wishlists[0].id).toBe('my-list');
   });

   it('parseItemDbListUrl returns null for invalid URLs', () => {
      expect(DailiesSettings.parseItemDbListUrl('')).toBe(null);
      expect(DailiesSettings.parseItemDbListUrl('https://example.com/lists/a/b')).toBe(null);
   });

   it('normalizeWishlist builds listUrl from slug when missing', () => {
      const wishlist = DailiesSettings.normalizeWishlist({ label: 'Books', slug: 'book-list', user: 'rayenz' });
      expect(wishlist.listUrl).toContain('book-list');
      expect(wishlist.id).toBe('book-list');
   });

   it('getWishlists keeps fully populated wishlists unchanged', () => {
      const complete = [{
         id: 'x',
         label: 'X',
         listUrl: 'https://itemdb.com.br/lists/u/s',
         slug: 's',
         user: 'u',
         img: '',
      }];
      expect(DailiesSettings.getWishlists({ wishlists: complete })).toEqual(complete);
   });

   it('isSchoolEnabled and shouldShowLink respect settings', () => {
      expect(DailiesSettings.isSchoolEnabled({}, 'battledome')).toBe(true);
      expect(DailiesSettings.isSchoolEnabled({ schools: { battledome: false } }, 'battledome')).toBe(false);
      expect(
         DailiesSettings.shouldShowLink({ id: 'illusen', faerieQuest: 'illusen' } as never, { faerieQuest: 'jhudora' }),
      ).toBe(false);
      expect(
         DailiesSettings.shouldShowLink({ id: 'battledome', school: 'battledome' } as never, { schools: { battledome: true } }),
      ).toBe(true);
   });

   it('parsePetImageSlug prefers main portrait and rejects stale slug on rename', () => {
      const html = '<img src="https://pets.neopets.com/cp/abc123/1/1.png">';
      expect(DailiesSettings.parsePetImageSlug(html)).toBe('abc123');
      expect(DailiesSettings.parsePetImageSlug(html, { previousSlug: 'abc123', nameChanged: true })).toBe(null);
      expect(
         DailiesSettings.parsePetImageSlug('<img src="https://pets.neopets.com/cp/oldslug/cp.png"><img src="https://pets.neopets.com/cp/newslug/cp.png">', {
            previousSlug: 'oldslug',
            nameChanged: true,
         }),
      ).toBe('newslug');
   });

   it('saveMainPet clears storage when name empty', () => {
      localStorage.setItem(DailiesSettings.MAIN_PET_KEY, 'Fluffy');
      DailiesSettings.saveMainPet('');
      expect(DailiesSettings.getMainPet()).toBe('');
      expect(DailiesSettings.hasMainPet()).toBe(false);
   });
});
