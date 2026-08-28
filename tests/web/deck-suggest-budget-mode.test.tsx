import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeckSuggestSetup } from '../../packages/web/src/deck-suggest/DeckSuggestSetup.tsx';
import { BudgetSpendTally } from '../../packages/web/src/deck-suggest/BudgetSpendTally.tsx';
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
  it('renders package tabs with summary and no accept buttons', () => {
    render(
      <PackagePanel
        packages={[
          {
            packageId: 'pkg-1',
            label: 'Removal + Ramp',
            totalUsd: 12.5,
            swapCount: 2,
            unknownPriceCount: 0,
            suggestionIds: ['s1', 's2'],
            focusTags: ['removal', 'ramp'],
          },
          {
            packageId: 'pkg-2',
            label: 'Card draw',
            totalUsd: 8,
            swapCount: 1,
            unknownPriceCount: 0,
            suggestionIds: ['s3'],
            focusTags: ['card-draw'],
          },
        ]}
      >
        <p>Review pane</p>
      </PackagePanel>,
    );
    expect(screen.getByRole('tab', { name: 'Removal + Ramp' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Card draw' })).toBeInTheDocument();
    expect(screen.getByText(/2 cards · \$12\.50 · removal, ramp/)).toBeInTheDocument();
    expect(screen.getByText('Review pane')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });
});

describe('BudgetSpendTally', () => {
  it('shows accepted spend and over-budget warning', () => {
    render(
      <BudgetSpendTally
        budgetUsd={25}
        suggestions={[
          {
            suggestion_id: 's1',
            action: 'consider',
            card: { name: 'Card A' },
            quantity: 1,
            roles_matched: [],
            confidence: 'medium',
            rationale: '',
            tags: [],
            replaces: [],
            priority_tier: 'normal',
            incomingUsd: 15,
          },
          {
            suggestion_id: 's2',
            action: 'consider',
            card: { name: 'Card B' },
            quantity: 1,
            roles_matched: [],
            confidence: 'medium',
            rationale: '',
            tags: [],
            replaces: [],
            priority_tier: 'normal',
            incomingUsd: 12,
          },
        ]}
        progress={{
          fileId: 'f1',
          decisions: {
            s1: { status: 'accepted', accepted: { action: 'seeking' } },
            s2: { status: 'accepted', accepted: { action: 'seeking' } },
          },
          currentSuggestionIndex: {},
        }}
      />,
    );
    expect(screen.getByText('Accepted $27.00 of $25.00 target')).toBeInTheDocument();
    expect(screen.getByText('Accepted swaps exceed the upgrade budget target.')).toBeInTheDocument();
  });
});
