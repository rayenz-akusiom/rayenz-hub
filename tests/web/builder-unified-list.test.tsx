import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { ExportBar } from '../../packages/web/src/deck-builder/import-export/ExportBar';
import { BrowseShell } from '../../packages/web/src/deck-builder/browse/BrowseShell';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

const categoryBrowseSpy = vi.fn();

vi.mock('../../packages/web/src/deck-builder/scryfall/useScryfallEnrich', () => ({
  useScryfallEnrich: () => ({ enriching: false }),
}));

vi.mock('../../packages/web/src/deck-builder/browse/CategoryBrowse', () => ({
  CategoryBrowse: (props: { browseView?: string; layout?: string }) => {
    categoryBrowseSpy(props);
    return (
      <div
        data-testid="category-browse-stub"
        data-browse-view={props.browseView}
        data-layout={props.layout}
      />
    );
  },
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
  categoryBrowseSpy.mockClear();
});

describe('ExportBar All Cards option', () => {
  it('offers All Cards in the Browse menu and reports the selection', async () => {
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
    await user.click(screen.getByRole('menuitem', { name: 'All Cards' }));

    expect(onViewChange).toHaveBeenCalledWith('all_cards');
  });

  it('shows All Cards as the current value when active', () => {
    render(
      <ExportBar
        view="all_cards"
        onViewChange={() => {}}
        layout="stacked"
        onLayoutChange={() => {}}
        cardSort="name_asc"
        onCardSortChange={() => {}}
        cardSize="M"
        onCardSizeChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Browse.*All Cards/i })).toBeInTheDocument();
  });
});

describe('BrowseShell All Cards view', () => {
  it('routes all_cards through CategoryBrowse when the browse view defaults to all_cards', () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      browseViewDefault: 'all_cards',
      lookingForEntries: [],
    };
    render(<BrowseShell deck={deck} onChange={() => {}} onBack={() => {}} />);
    expect(screen.getAllByTestId('category-browse-stub')[0]).toHaveAttribute(
      'data-browse-view',
      'all_cards',
    );
  });

  it('switches into All Cards via the Browse menu and preserves layout', async () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      browseViewDefault: null,
      cardLayoutDefault: 'grid',
      lookingForEntries: [],
    };
    const user = userEvent.setup();
    render(<BrowseShell deck={deck} onChange={() => {}} onBack={() => {}} />);

    expect(screen.getAllByTestId('category-browse-stub')[0]).toHaveAttribute(
      'data-browse-view',
      'category',
    );

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'All Cards' }));

    expect(screen.getAllByTestId('category-browse-stub')[0]).toHaveAttribute(
      'data-browse-view',
      'all_cards',
    );
    expect(categoryBrowseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        browseView: 'all_cards',
        layout: 'grid',
      }),
    );
  });
});
