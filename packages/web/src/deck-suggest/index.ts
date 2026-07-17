import {
  attachProfileLists,
  buildDeckFromImportText,
  buildDeckRuleContext,
  clearDataSetPoolCache,
  enrichDeckWithProfile,
  ensureSetPoolIndexed,
  fetchDeckSnapshot,
  fetchSetPool,
  getDeckSwapQueue,
  indexSetPool,
  loadDeckRegistry,
  loadSetScopeFromUpload,
  parseDeckListFromText,
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
export * from './tagger';
export { Tagger, RoleRules } from './tagger';
export * from './rules-queue';
export { QueueRules } from './rules-queue';
export * from './rules-proxy';
export { ProxyRules } from './rules-proxy';
export * from './rules';
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
  loadDeckRegistry,
  parseDeckListFromText,
  buildDeckFromImportText,
  fetchDeckSnapshot,
  readProfileForDeck,
  enrichDeckWithProfile,
  attachProfileLists,
  clearSetPoolCache: clearDataSetPoolCache,
};
