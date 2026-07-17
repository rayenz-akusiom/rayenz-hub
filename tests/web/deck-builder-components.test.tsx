import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardInstance, DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { moveCardCategory } from '@rayenz-hub/shared';
import { LibraryView } from '../../packages/web/src/deck-builder/library/LibraryView';
import { FormatBadge } from '../../packages/web/src/deck-builder/ui/FormatBadge';
import { DbMenu, DbMenuItem } from '../../packages/web/src/deck-builder/ui/DbMenu';
import { ExportBar } from '../../packages/web/src/deck-builder/import-export/ExportBar';
import { MoveSheet } from '../../packages/web/src/deck-builder/edit/MoveSheet';
import { SwapQueuePanel } from '../../packages/web/src/deck-builder/swaps/SwapQueuePanel';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

const commanderDoc = commanderFixture as DeckDocument;

const noop = () => {};

afterEach(() => {
  cleanup();
});

describe('FormatBadge', () => {
  it.each([
    ['commander', 'Commander'],
    ['cube', 'Cube'],
    ['other', 'Other'],
  ] as const)('renders %s label', (format, label) => {
    render(<FormatBadge format={format} showLabel />);
    expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('DbMenu', () => {
  it('opens menu and selects an item', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <DbMenu label="Browse" value="Categories">
        <DbMenuItem active onSelect={onSelect}>
          Categories
        </DbMenuItem>
        <DbMenuItem onSelect={vi.fn()}>Colour identity</DbMenuItem>
      </DbMenu>,
    );

    const trigger = screen.getByRole('button', { name: /Browse/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Categories' }));
    expect(onSelect).toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <DbMenu label="Layout" value="Stacked">
        <DbMenuItem active>Stacked</DbMenuItem>
      </DbMenu>,
    );

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('LibraryView', () => {
  const summary = (over: Partial<DeckSummary> & Pick<DeckSummary, 'deckId' | 'name' | 'format'>): DeckSummary => ({
    deckId: over.deckId,
    name: over.name,
    format: over.format,
    updatedAt: over.updatedAt ?? '2026-01-01T00:00:00.000Z',
    coverImageUrl: over.coverImageUrl ?? null,
    coverImageUrlSecondary: over.coverImageUrlSecondary ?? null,
    coverPartnerStatus: over.coverPartnerStatus ?? null,
    coverCardName: over.coverCardName ?? null,
  });

  it('renders loading and error states', () => {
    const { rerender } = render(
      <LibraryView
        decks={[]}
        loading
        error={null}
        onOpen={noop}
        onAdd={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByLabelText(/loading library/i)).toBeInTheDocument();

    rerender(
      <LibraryView
        decks={[]}
        loading={false}
        error="Load failed"
        onOpen={noop}
        onAdd={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByText('Load failed')).toBeInTheDocument();
    expect(screen.queryByLabelText(/loading library/i)).not.toBeInTheDocument();
  });

  it('renders empty state and sync button when provided', async () => {
    const onAdd = vi.fn();
    const onRefreshRemote = vi.fn();
    const user = userEvent.setup();

    render(
      <LibraryView
        decks={[]}
        loading={false}
        onOpen={noop}
        onAdd={onAdd}
        onDelete={noop}
        onRefreshRemote={onRefreshRemote}
      />,
    );

    expect(screen.getByText('No Hub-saved decks yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sync from API' }));
    expect(onRefreshRemote).toHaveBeenCalled();
    await user.click(screen.getAllByRole('button', { name: 'Add deck' })[1]!);
    expect(onAdd).toHaveBeenCalled();
  });

  it('renders partner cover tiles and delete control', async () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <LibraryView
        decks={[
          summary({
            deckId: 'p1',
            name: 'Partners',
            format: 'commander',
            coverImageUrl: 'https://example.com/a.jpg',
            coverImageUrlSecondary: 'https://example.com/b.jpg',
            coverPartnerStatus: 'illegal',
          }),
        ]}
        onOpen={onOpen}
        onAdd={noop}
        onDelete={onDelete}
      />,
    );

    const tile = screen.getByText('Partners', { selector: '.db-library-tile-name' }).closest('li')!;
    const openBtn = within(tile).getAllByRole('button')[0]!;
    expect(openBtn).toHaveAttribute('title', expect.stringMatching(/partner/i));
    await user.click(openBtn);
    expect(onOpen).toHaveBeenCalledWith('p1');

    await user.click(screen.getByRole('button', { name: 'Delete Partners' }));
    expect(onDelete).toHaveBeenCalledWith('p1');
  });

  it('sorts commander decks by recent vs A–Z vs highlighted card', async () => {
    localStorage.removeItem('rayenz-deck-builder-library-sort');
    const user = userEvent.setup();
    const decks = [
      summary({
        deckId: 'zebra',
        name: 'Zebra',
        format: 'commander',
        updatedAt: '2026-06-01T00:00:00.000Z',
        coverCardName: 'Sol Ring',
      }),
      summary({
        deckId: 'alpha',
        name: 'Alpha',
        format: 'commander',
        updatedAt: '2026-01-01T00:00:00.000Z',
        coverCardName: 'Zetalpa, Primal Dawn',
      }),
    ];

    render(
      <LibraryView decks={decks} onOpen={noop} onAdd={noop} onDelete={noop} />,
    );

    const names = () =>
      [...document.querySelectorAll('.db-library-section[aria-label="Commander"] .db-library-tile-name')].map(
        (el) => el.textContent,
      );

    expect(names()).toEqual(['Zebra', 'Alpha']);

    await user.selectOptions(screen.getByLabelText('Library sort'), 'name');
    expect(names()).toEqual(['Alpha', 'Zebra']);
    expect(localStorage.getItem('rayenz-deck-builder-library-sort')).toBe('name');

    await user.selectOptions(screen.getByLabelText('Library sort'), 'cover');
    expect(names()).toEqual(['Zebra', 'Alpha']);
    expect(localStorage.getItem('rayenz-deck-builder-library-sort')).toBe('cover');
  });
});

describe('ExportBar', () => {
  it('changes browse view and layout via menus', async () => {
    const onViewChange = vi.fn();
    const onLayoutChange = vi.fn();
    const onAddCard = vi.fn();
    const user = userEvent.setup();

    render(
      <ExportBar
        onAddCard={onAddCard}
        view="category"
        onViewChange={onViewChange}
        layout="stacked"
        onLayoutChange={onLayoutChange}
        cardSize="M"
        onCardSizeChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add card…' }));
    expect(onAddCard).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Colour identity' }));
    expect(onViewChange).toHaveBeenCalledWith('colour_identity');

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Grid' }));
    expect(onLayoutChange).toHaveBeenCalledWith('grid');
  });
});

describe('MoveSheet', () => {
  it('applies category move', async () => {
    const card = commanderDoc.cards[0] as CardInstance;
    const onApply = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <MoveSheet deck={commanderDoc} card={card} onClose={onClose} onApply={onApply} />,
    );

    expect(screen.getByRole('dialog', { name: 'Move card' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Category'), 'Land');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: moveCardCategory(commanderDoc.cards, card.instanceId, 'Land', card.stack),
      }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without applying', async () => {
    const card = commanderDoc.cards[0] as CardInstance;
    const onApply = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <MoveSheet deck={commanderDoc} card={card} onClose={onClose} onApply={onApply} />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('SwapQueuePanel', () => {
  const panelProps = {
    onStartEdit: vi.fn(),
    onDraftChange: vi.fn(),
    onConfirmIn: vi.fn(),
    onCancelEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    onRemoveEdit: vi.fn(),
  };

  it('adds swap entry and shows incomplete warning', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SwapQueuePanel
        deck={commanderDoc}
        onChange={onChange}
        draft={null}
        {...panelProps}
      />,
    );

    expect(screen.getByText('No swap pairings yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        formalSwapEntries: expect.arrayContaining([
          expect.objectContaining({ inInstanceId: null, outInstanceId: null }),
        ]),
      }),
    );
  });

  it('opens edit chrome for an existing entry', async () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: commanderDoc.cards[0]!.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: 'test note',
        },
      ],
    };
    const onStartEdit = vi.fn();
    const user = userEvent.setup();

    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={null}
        {...panelProps}
        onStartEdit={onStartEdit}
      />,
    );

    expect(screen.getByText('→ Creature')).toBeInTheDocument();
    await user.click(screen.getByTitle('Click to edit swap'));
    expect(onStartEdit).toHaveBeenCalledWith(deck.formalSwapEntries[0]);
  });

  it('shows incomplete warning and hides empty category text', () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-draft',
          inInstanceId: null,
          outInstanceId: commanderDoc.cards[0]!.instanceId,
          inTargetCategory: null,
          sortIndex: 0,
          notes: null,
        },
      ],
    };

    render(
      <SwapQueuePanel deck={deck} onChange={vi.fn()} draft={null} {...panelProps} />,
    );

    expect(screen.getByText('1 incomplete pairing(s)')).toBeInTheDocument();
    expect(screen.queryByText('→ category?')).not.toBeInTheDocument();
    expect(screen.queryByText(/^→ /)).not.toBeInTheDocument();
  });

  it('shows picker-sized pop-out on hover', async () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: commanderDoc.cards[0]!.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    const user = userEvent.setup();

    render(
      <SwapQueuePanel deck={deck} onChange={vi.fn()} draft={null} {...panelProps} />,
    );

    const pair = screen.getByTitle('Click to edit swap');
    expect(document.querySelector('.db-swap-pair-popout')).not.toBeInTheDocument();

    await user.hover(pair);

    const popout = document.querySelector('.db-swap-pair-popout');
    expect(popout).toBeInTheDocument();
    expect(popout?.querySelector('.db-swap-pair-stack.is-full')).toBeTruthy();
    expect(within(popout as HTMLElement).getByText('→ Creature')).toBeInTheDocument();

    await user.unhover(pair);
    expect(document.querySelector('.db-swap-pair-popout')).not.toBeInTheDocument();
  });

  it('renders edit chrome, Out picker, and In search takeover in the same dialog', async () => {
    const foilCard: CardInstance = {
      ...commanderDoc.cards[0]!,
      instanceId: 'foil-1',
      quantity: 2,
      foil: true,
      layout: 'transform',
      scryfallId: 'sf-transform',
    };
    const deck: DeckDocument = {
      ...commanderDoc,
      cards: [...commanderDoc.cards, foilCard],
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: foilCard.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: 'note',
        },
      ],
    };
    const draft = {
      entryId: 'swap-1',
      inInstanceId: foilCard.instanceId,
      outInstanceId: commanderDoc.cards[1]!.instanceId,
      inTargetCategory: 'Land',
      notes: 'updated note',
    };
    const onDraftChange = vi.fn();
    const onConfirmIn = vi.fn();
    const onCancelEdit = vi.fn();
    const onSaveEdit = vi.fn();
    const onRemoveEdit = vi.fn();
    const openPicker = vi.fn();
    (window as Window & { HubCardPicker?: { open: typeof openPicker } }).HubCardPicker = {
      open: openPicker,
    };
    const user = userEvent.setup();

    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={draft}
        onStartEdit={vi.fn()}
        onDraftChange={onDraftChange}
        onConfirmIn={onConfirmIn}
        onCancelEdit={onCancelEdit}
        onSaveEdit={onSaveEdit}
        onRemoveEdit={onRemoveEdit}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument();
    expect(document.body.querySelectorAll('.db-modal')).toHaveLength(1);
    expect(document.body.querySelector('.db-swap-edit-slots')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Change Out' }));
    expect(openPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Select Out card',
        groupByCategory: true,
        selectedValue: commanderDoc.cards[1]!.instanceId,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Change In' }));
    expect(screen.getByRole('dialog', { name: 'Choose In card from Scryfall' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Choose In card from Scryfall' })).toBeInTheDocument();
    expect(document.body.querySelectorAll('.db-modal')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument();
    // Prior In remains pinned — edit form still has Out/In slots and notes
    expect(document.body.querySelector('.db-swap-edit-slots')).toBeTruthy();
    expect(screen.getByDisplayValue('updated note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change In' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Place In card in category'), 'Land');
    expect(onDraftChange).toHaveBeenCalledWith({ inTargetCategory: 'Land' });

    fireEvent.change(screen.getByDisplayValue('updated note'), { target: { value: 'new notes' } });
    expect(onDraftChange).toHaveBeenCalledWith({ notes: 'new notes' });

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSaveEdit).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancelEdit).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemoveEdit).toHaveBeenCalled();
  });
});
