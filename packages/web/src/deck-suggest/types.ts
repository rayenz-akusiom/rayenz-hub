export type {
  Coverage,
  DebugEntry,
  DeckLoadTab,
  DeckProfile,
  DeckProfileConstraints,
  DeckRecord,
  DeckResult,
  DeckSelection,
  PageDeckResult,
  ReadinessItem,
  ReadinessResult,
  RuleAudit,
  SetPoolCard,
  SetScope,
  SnapshotCard,
  Suggestion,
  SuggestionSignals,
  TaggerContext,
} from '@rayenz-hub/shared/suggest';

import type {
  DeckSuggestSettings as SharedDeckSuggestSettings,
  DeckSuggestState as SharedDeckSuggestState,
  GenerationRun as SharedGenerationRun,
} from '@rayenz-hub/shared/suggest';

export type SetInputMode = 'release' | 'codes' | 'budget';

export type GenerationRun = SharedGenerationRun & {
  cap?: number;
  setCodes?: string[];
  setCodesKey?: string;
  mode?: 'set' | 'budget';
  upgradePoolKey?: string;
  focusTags?: string[];
};

export type DeckSuggestSettings = SharedDeckSuggestSettings & {
  releaseId?: string;
  setInputMode?: SetInputMode;
  budgetUsd?: number;
  focusTags?: string[];
  excludeOwned?: boolean;
  maxSwaps?: number;
  /** @deprecated legacy */
  productName?: string;
};

export type DeckSuggestState = Omit<SharedDeckSuggestState, 'ui' | 'settings' | 'generationRun'> & {
  generationRun: GenerationRun | null;
  ui: {
    setCodesInput: string;
    releaseId: string;
    setInputMode: SetInputMode;
    budgetUsdInput: string;
    focusTags: string[];
    focusTagInput: string;
  };
  settings: DeckSuggestSettings;
};
