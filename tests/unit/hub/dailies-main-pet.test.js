import { describe, expect, it, beforeEach } from 'vitest';
import { readHubFile, runInWindow } from '../helpers/hubHarness.js';

describe('dailies main pet', () => {
   beforeEach(() => {
      localStorage.clear();
      runInWindow(readHubFile('shared/storage.js'));
      runInWindow(readHubFile('apps/dailies/dailies-settings.js'));
      runInWindow(readHubFile('shared/hub-utils.js'));
      runInWindow(readHubFile('apps/dailies/dailies-links.js'));
      runInWindow(readHubFile('apps/dailies/dailies-render.js'));
   });

   it('has no default pet until set', () => {
      expect(window.DailiesSettings.getMainPet()).toBe('');
      expect(window.DailiesSettings.hasMainPet()).toBe(false);
   });

   it('persists main pet into local keys and dailies settings blob', () => {
      window.DailiesSettings.saveMainPet('Blue_Test_Pet', 'abc123slug');
      const settings = window.DailiesSettings.loadSettings();
      settings.mainPetName = 'Blue_Test_Pet';
      settings.mainPetSlug = 'abc123slug';
      window.DailiesSettings.saveSettings(settings);

      expect(window.DailiesSettings.getMainPet()).toBe('Blue_Test_Pet');
      expect(window.DailiesSettings.getMainPetSlug()).toBe('abc123slug');
      expect(window.DailiesSettings.hasMainPet()).toBe(true);

      const saved = window.HubStorage.loadDailiesSettings();
      expect(saved.mainPetName).toBe('Blue_Test_Pet');
      expect(saved.mainPetSlug).toBe('abc123slug');
   });

   it('renders empty sidebar name plate when pet is unset', () => {
      const html = window.DailiesRender.renderMainPetSidebarTile(
         { id: 'main-pet', petHref: 'https://www.neopets.com/island/fight_training.phtml?type=status' },
         ''
      );
      expect(html).toContain('pet-tile--empty');
      expect(html).toContain('Main Pet');
      expect(html).toContain('pet-edit-btn');
      expect(html).not.toContain('pets.neopets.com/cpn/');
   });

   it('renders named sidebar tile with edit control when pet is set', () => {
      const html = window.DailiesRender.renderMainPetSidebarTile(
         { id: 'main-pet', petHref: 'https://www.neopets.com/island/fight_training.phtml?type=status' },
         'My_Pet'
      );
      expect(html).toContain('My_Pet');
      expect(html).toContain('pets.neopets.com/cpn/My_Pet');
      expect(html).toContain('pet-edit-btn');
      expect(html).not.toContain('pet-tile--empty');
   });

   it('parsePetImageSlug prefers main /1/1.png over first sidebar /cp/ hit', () => {
      const html = [
         '<img src="https://pets.neopets.com/cp/sidebarnow/1/4.png">',
         '<img src="https://pets.neopets.com/cp/mainpetabc/1/1.png">',
      ].join('');
      expect(window.DailiesSettings.parsePetImageSlug(html)).toBe('mainpetabc');
   });

   it('parsePetImageSlug rejects previous slug when name changed and only sidebar matches', () => {
      const html = '<img src="https://pets.neopets.com/cp/oldslug99/1/4.png">';
      expect(
         window.DailiesSettings.parsePetImageSlug(html, {
            previousSlug: 'oldslug99',
            nameChanged: true,
         })
      ).toBe(null);
   });

   it('parsePetImageSlug returns a distinct slug when name changed', () => {
      const html = [
         '<img src="https://pets.neopets.com/cp/oldslug99/1/4.png">',
         '<img src="https://pets.neopets.com/cp/newslug12/4/1.png">',
      ].join('');
      expect(
         window.DailiesSettings.parsePetImageSlug(html, {
            previousSlug: 'oldslug99',
            nameChanged: true,
         })
      ).toBe('newslug12');
   });

   it('clears mainPetSlug from settings blob when pet is saved without slug', () => {
      window.DailiesSettings.saveMainPet('Old_Pet', 'oldslug99');
      const settings = window.DailiesSettings.loadSettings();
      settings.mainPetName = 'Old_Pet';
      settings.mainPetSlug = 'oldslug99';
      window.DailiesSettings.saveSettings(settings);

      window.DailiesSettings.saveMainPet('New_Pet', null);
      const next = window.DailiesSettings.loadSettings();
      delete next.mainPetSlug;
      next.mainPetName = 'New_Pet';
      window.DailiesSettings.saveSettings(next);

      expect(window.DailiesSettings.getMainPet()).toBe('New_Pet');
      expect(window.DailiesSettings.getMainPetSlug()).toBe('');
      expect(window.HubStorage.loadDailiesSettings().mainPetSlug).toBeUndefined();
   });
});
