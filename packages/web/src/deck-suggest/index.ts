import {
  attachProfileLists,
  buildDeckRuleContext,
  clearDataSetPoolCache,
  enrichDeckWithProfile,
  ensureSetPoolIndexed,
  fetchSetPool,
  getDeckSwapQueue,
  hubDeckToRecord,
  indexSetPool,
  loadHubLibraryDecks,
  loadSetScopeFromUpload,
  buildDeckFromImportText,
  parseYamlProfile,
  readProfileForDeck,
  resolveDeckEligibility,
  tryRestoreSetPool,
} from './data';

export * from './types';
export * from './readiness';
export * from './data';
export { RuleGuards } from '@rayenz-hub/shared/suggest';
export * from './debug';
export { Debug } from './debug';
export * from './export';
export { Export } from './export';
export * from './deck-load';
export * from './generation';

export const Data = {
  parseYamlProfile,
  resolveDeckEligibility,
  indexSetPool,
  ensureSetPoolIndexed,
  buildDeckRuleContext,
  getDeckSwapQueue,
  fetchSetPool,
  tryRestoreSetPool,
  loadSetScopeFromUpload,
  readProfileForDeck,
  enrichDeckWithProfile,
  attachProfileLists,
  hubDeckToRecord,
  loadHubLibraryDecks,
  clearSetPoolCache: clearDataSetPoolCache,
  buildDeckFromImportText,
};
