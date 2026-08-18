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

export type SetInputMode = 'release' | 'codes';

export type GenerationRun = SharedGenerationRun & {
  cap?: number;
  setCodes?: string[];
  setCodesKey?: string;
};

export type DeckSuggestSettings = SharedDeckSuggestSettings & {
  releaseId?: string;
  setInputMode?: SetInputMode;
  /** @deprecated legacy */
  productName?: string;
};

export type DeckSuggestState = Omit<SharedDeckSuggestState, 'ui' | 'settings' | 'generationRun'> & {
  generationRun: GenerationRun | null;
  ui: {
    setCodesInput: string;
    releaseId: string;
    setInputMode: SetInputMode;
  };
  settings: DeckSuggestSettings;
};
