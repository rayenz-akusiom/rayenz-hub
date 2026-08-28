import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DeckSuggestSetup } from '../../packages/web/src/deck-suggest/DeckSuggestSetup.tsx';
import { PackagePanel } from '../../packages/web/src/deck-suggest/PackagePanel.tsx';
import type { DeckSelection, DeckSuggestSettings, SetInputMode } from '../../packages/web/src/deck-suggest/types.ts';

const baseSettings: DeckSuggestSettings = {};
const baseSelection: DeckSelection = {
  folderUrl: '',
  decks: [{ deck_id: 'd1', deck_name: 'Deck One' }],
  selectedIds: ['d1'],
};

function renderSetup(mode: SetInputMode = 'budget') {
  return render(
    <DeckSuggestSetup
      settings={baseSettings}
      setSettings={() => {}}
      setInputMode={mode}
      onSetInputMode={() => {}}
      releaseId=""
      onReleaseId={() => {}}
      setCodesInput=""
      onSetCodesInput={() => {}}
      resolvedSetCodes={[]}
      budgetUsdInput="25"
      onBudgetUsdInput={() => {}}
      focusTags={[]}
      onFocusTags={() => {}}
      focusTagInput=""
      onFocusTagInput={() => {}}
      deckSelection={baseSelection}
      onDeckSelectionChange={() => {}}
      decksLoading={false}
    />,
  );
}

describe('DeckSuggestSetup budget mode', () => {
  it('shows Budget upgrade tab without precon/league labels', () => {
    renderSetup('budget');
    expect(screen.getByRole('tab', { name: 'Budget upgrade' })).toBeInTheDocument();
    expect(screen.queryByText(/precon/i)).toBeNull();
    expect(screen.queryByText(/league/i)).toBeNull();
  });
});

describe('PackagePanel', () => {
  it('routes accept through the shared suggestion handler', () => {
    const onAccept = vi.fn();
    const suggestion = {
      suggestion_id: 's1',
      action: 'replace',
      card: { name: 'Feed the Swarm' },
      quantity: 1,
      roles_matched: [],
      confidence: 'medium',
      rationale: '',
      tags: [],
      replaces: [{ name: 'Duress', quantity: 1 }],
      priority_tier: 'normal',
      incomingUsd: 3.5,
    };
    render(
      <PackagePanel
        packages={[
          {
            packageId: 'pkg-fitting',
            label: 'Essentials',
            totalUsd: 3.5,
            swapCount: 1,
            unknownPriceCount: 0,
            suggestionIds: ['s1'],
          },
        ]}
        suggestions={[suggestion]}
        onAccept={onAccept}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ suggestion_id: 's1' }));
  });
});
