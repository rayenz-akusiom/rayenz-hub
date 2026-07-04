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
});
