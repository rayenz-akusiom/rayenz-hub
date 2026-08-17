export {
  analyzableOracleText,
  collectingUrlForName,
  fetchReleaseCards,
  fetchSetCards,
  fetchSetMetadata,
  parseSetCodesFromText,
  resolveSets,
  slugifySetName,
  SCRYFALL_SUGGEST_POOL_FILTERS,
  type FetchSetCardsResult,
  type NormalizedSetCard,
  type ResolveSetsResult,
  type ScryfallSetMeta,
} from './resolve-sets.js';

export {
  buildReleaseCatalog,
  expandBlockSetCodes,
  expandGroupSetCodes,
  familyRootCode,
  PLAYABLE_RELEASE_SET_TYPES,
  type ReleaseCatalog,
  type ReleaseCatalogEntry,
  type ReleaseKind,
  type ScryfallSetRow,
} from './release-catalog.js';

export { getReleaseCatalog } from './release-catalog-data.js';

export {
  attachTagsToCard,
  indexArtTags,
  indexOracleTags,
  loadScryfallTagIndexes,
  maybeAttachScryfallTags,
  resetScryfallTagIndexCache,
  tagsForIllustrationId,
  tagsForOracleId,
  type ScryfallTag,
  type ScryfallTagIndexes,
} from './oracle-tags.js';
