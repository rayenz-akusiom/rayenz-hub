import { useMemo, useState } from 'react';
import type { DeckDocument } from '@rayenz-hub/shared';
import {
  SwapEditChrome,
  type SwapEditDraft,
} from '../deck-builder/swaps/swap-edit-chrome';
import { legalOutCards, type AcceptPrintingChoice } from './accept';
import type { Suggestion } from './types';

type Props = {
  suggestion: Suggestion;
  deck: DeckDocument;
  protectedCards?: string[];
  onCancel: () => void;
  onSwap: (
    outInstanceId: string,
    choice: AcceptPrintingChoice,
    meta?: { inTargetCategory: string | null; notes: string },
  ) => void;
  onSeeking: (choice: AcceptPrintingChoice) => void;
};

const PROTECTED_OUT_CATEGORIES = ['Commander', 'Lieutenant', 'Lieutenants'];

function draftForSuggestion(deck: DeckDocument, suggestion: Suggestion): SwapEditDraft {
  const outs = legalOutCards(deck);
  const prefillName = suggestion.replaces?.[0]?.name;
  const prefillId =
    (prefillName && outs.find((o) => o.name === prefillName)?.instanceId) || null;
  return {
    entryId: `suggest-${suggestion.suggestion_id}`,
    inInstanceId: null,
    outInstanceId: prefillId,
    inTargetCategory: null,
    notes: '',
  };
}

export function AcceptDialogue({
  suggestion,
  deck,
  protectedCards,
  onCancel,
  onSwap,
  onSeeking,
}: Props) {
  const [draft, setDraft] = useState<SwapEditDraft>(() => draftForSuggestion(deck, suggestion));
  const outPickerFilter = useMemo(
    () => ({
      excludeNames: protectedCards || [],
      excludePrimaryCategories: PROTECTED_OUT_CATEGORIES,
    }),
    [protectedCards],
  );

  return (
    <SwapEditChrome
      mode="suggest-accept"
      showSeekingTab
      deck={deck}
      draft={draft}
      onDraftChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
      onConfirmIn={() => {}}
      onClose={onCancel}
      suggestIn={{
        name: suggestion.card.name,
        scryfallId: suggestion.card.scryfall_id || null,
        setCode: suggestion.card.set_code || null,
        collectorNumber: suggestion.card.collector_number || null,
      }}
      outPickerFilter={outPickerFilter}
      onAcceptSwap={(outId, choice, meta) => onSwap(outId, choice, meta)}
      onAcceptSeeking={onSeeking}
    />
  );
}
