/**
 * Attach TypeScript dailies domain modules to window for legacy hub unit tests.
 */
import * as DailiesItemdb from '../../../packages/web/src/dailies/itemdb.ts';
import * as DailiesLinks from '../../../packages/web/src/dailies/links.ts';
import * as DailiesSettings from '../../../packages/web/src/dailies/settings.ts';
import * as DailiesTimed from '../../../packages/web/src/dailies/timed.ts';
import * as DailiesWishingWell from '../../../packages/web/src/dailies/wishing-well.ts';

export function installDailiesGlobals() {
  window.DailiesItemdb = DailiesItemdb;
  window.DailiesLinks = DailiesLinks;
  window.DailiesSettings = DailiesSettings;
  window.DailiesTimed = DailiesTimed;
  window.DailiesWishingWell = DailiesWishingWell;
}
