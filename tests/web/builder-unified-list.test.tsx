import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { ExportBar } from '../../packages/web/src/deck-builder/import-export/ExportBar';
import { BrowseShell } from '../../packages/web/src/deck-builder/browse/BrowseShell';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

vi.mock('../../packages/web/src/deck-builder/scryfall/useScryfallEnrich', () => ({
  useScryfallEnrich: () => ({ enriching: false }),
}));

vi.mock('../../packages/web/src/deck-builder/browse/CategoryBrowse', () => ({
  CategoryBrowse: () => <div data-testid="category-browse-stub" />,
}));

vi.mock('../../packages/web/src/deck-builder/browse/ColourIdentityBrowse', () => ({
  ColourIdentityBrowse: () => <div data-testid="ci-browse-stub" />,
}));

vi.mock('../../packages/web/src/deck-builder/swaps/SwapQueuePanel', () => ({
  SwapQueuePanel: () => <div data-testid="swap-queue-panel-stub" />,
}));

const commanderDoc = commanderFixture as DeckDocument;

afterEach(() => {
  cleanup();
});

describe('ExportBar Unified List option', () => {
  it('offers Unified List in the Browse menu and reports the selection', async () => {
    const onViewChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ExportBar
        view="category"
        onViewChange={onViewChange}
        layout="stacked"
        onLayoutChange={() => {}}
        cardSort="name_asc"
        onCardSortChange={() => {}}
        cardSize="M"
        onCardSizeChange={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Unified List' }));

    expect(onViewChange).toHaveBeenCalledWith('unified_list');
  });

  it('shows Unified List as the current value when active', () => {
    render(
      <ExportBar
        view="unified_list"
        onViewChange={() => {}}
        layout="stacked"
        onLayoutChange={() => {}}
        cardSort="name_asc"
        onCardSortChange={() => {}}
        cardSize="M"
        onCardSizeChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Browse.*Unified List/i })).toBeInTheDocument();
  });
});

describe('BrowseShell Unified List view', () => {
  it('renders UnifiedListBrowse when the browse view defaults to unified_list', () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      browseViewDefault: 'unified_list',
      lookingForEntries: [],
    };
    render(<BrowseShell deck={deck} onChange={() => {}} onBack={() => {}} />);
    expect(screen.getByTestId('unified-list-browse')).toBeInTheDocument();
  });

  it('switches into Unified List via the Browse menu', async () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      browseViewDefault: null,
      lookingForEntries: [],
    };
    const user = userEvent.setup();
    render(<BrowseShell deck={deck} onChange={() => {}} onBack={() => {}} />);

    expect(screen.queryByTestId('unified-list-browse')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Unified List' }));

    expect(screen.getByTestId('unified-list-browse')).toBeInTheDocument();
  });
});
