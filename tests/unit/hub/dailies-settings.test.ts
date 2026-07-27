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

   it('returns official enabled lists when settings omit tracking overlays', () => {
      const wishlists = window.DailiesSettings.getWishlists({ faerieQuest: 'illusen' });
      expect(wishlists).toHaveLength(4);
      expect(wishlists[0].slug).toBe('gourmet-food');
      expect(wishlists[0].user).toBe('official');
      expect(wishlists[3].slug).toBe('all-collectibles');
   });

   it('disables lists via trackingLists overlays', () => {
      const wishlists = window.DailiesSettings.getWishlists({
         trackingLists: {
            'gourmet-food': { enabled: false },
            'books-checklist': { enabled: true, img: 'https://example/book.gif' },
         },
      });
      expect(wishlists.map((w) => w.id)).toEqual([
         'books-checklist',
         'booktastic-checklist',
         'stamps-wishlist',
      ]);
      expect(wishlists[0].img).toBe('https://example/book.gif');
   });

   it('migrates legacy personal checklist wishlists into overlays on save', () => {
      window.DailiesSettings.saveSettings({
         faerieQuest: 'illusen',
         schools: {},
         wishlists: [{
            id: 'gourmet-food',
            label: 'Gourmet Food',
            listUrl: 'https://itemdb.com.br/lists/rayenz/gourmet-food-checklist',
            slug: 'gourmet-food-checklist',
            user: 'rayenz',
            img: 'https://example/icon.gif',
         }],
      });
      const saved = window.HubStorage.loadDailiesSettings();
      expect(saved.wishlists).toBeUndefined();
      expect(saved.trackingLists['gourmet-food'].img).toBe('https://example/icon.gif');
   });

   it('parseItemDbListUrl returns null for invalid URLs', () => {
      expect(DailiesSettings.parseItemDbListUrl('')).toBe(null);
      expect(DailiesSettings.parseItemDbListUrl('https://example.com/lists/a/b')).toBe(null);
   });

   it('normalizeWishlist builds listUrl from slug when missing', () => {
      const wishlist = DailiesSettings.normalizeWishlist({ label: 'Books', slug: 'book-list', user: 'official' });
      expect(wishlist.listUrl).toContain('book-list');
      expect(wishlist.id).toBe('book-list');
   });

   it('getWishlists ignores custom non-official entries', () => {
      const wishlists = DailiesSettings.getWishlists({
         wishlists: [{
            id: 'x',
            label: 'X',
            listUrl: 'https://itemdb.com.br/lists/u/s',
            slug: 's',
            user: 'u',
            img: '',
         }],
      });
      expect(wishlists).toHaveLength(4);
      expect(wishlists.every((w) => w.user === 'official')).toBe(true);
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
