import {
  attachProfileLists,
  buildDeckRuleContext,
  clearDataSetPoolCache,
  enrichDeckWithProfile,
  ensureSetPoolIndexed,
  fetchDeckSnapshot,
  fetchSetPool,
  getDeckSwapQueue,
  hubDeckToRecord,
  indexSetPool,
  loadHubLibraryDecks,
  loadSetScopeFromUpload,
  parseDeckListFromText,
  buildDeckFromImportText,
  parseYamlProfile,
  readProfileForDeck,
  resolveDeckEligibility,
  tryRestoreSetPool,
} from './data';

export * from './types';
export * from './readiness';
export * from './data';
export * from './rule-guards';
export { RuleGuards } from './rule-guards';
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
  fetchDeckSnapshot,
  readProfileForDeck,
  enrichDeckWithProfile,
  attachProfileLists,
  hubDeckToRecord,
  loadHubLibraryDecks,
  clearSetPoolCache: clearDataSetPoolCache,
  parseDeckListFromText,
  buildDeckFromImportText,
};
