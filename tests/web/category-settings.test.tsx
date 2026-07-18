import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { CategorySettingsPanel } from '../../packages/web/src/deck-builder/edit/CategorySettingsPanel';
import { CategoryEditDialog } from '../../packages/web/src/deck-builder/edit/CategoryEditDialog';
import { CardContextMenu } from '../../packages/web/src/deck-builder/edit/CardContextMenu';
import { CategoryBrowse } from '../../packages/web/src/deck-builder/browse/CategoryBrowse';
import cubeFixture from '../fixtures/deck-builder/cube-slice.json';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

afterEach(() => {
  cleanup();
});

const cubeDoc = cubeFixture as DeckDocument;
const commanderDoc = commanderFixture as DeckDocument;

describe('CategorySettingsPanel', () => {
  it('splits Order and Deck options; cube target is editable', () => {
    const onChange = vi.fn();
    const deck: DeckDocument = {
      ...cubeDoc,
      format: 'cube',
      cubeTargetSize: 360,
      categories: [
        { name: 'White', includedInDeck: true, includedInPrice: true, target: null },
        { name: 'Blue', includedInDeck: true, includedInPrice: true, target: null },
      ],
    };

    render(
      <CategorySettingsPanel deck={deck} onChange={onChange} onClose={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: 'Order' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Deck options' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Cube target size/i)).toHaveValue(360);
    expect(screen.queryByLabelText(/Target for White/i)).not.toBeInTheDocument();
  });

  it('opens edit when a category name is clicked', async () => {
    const onEditCategory = vi.fn();
    const user = userEvent.setup();
    const deck: DeckDocument = {
      ...cubeDoc,
      categories: [
        { name: 'White', includedInDeck: true, includedInPrice: true, target: null },
      ],
    };

    render(
      <CategorySettingsPanel
        deck={deck}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onEditCategory={onEditCategory}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'White' }));
    expect(onEditCategory).toHaveBeenCalledWith('White');
  });

  it('adds a category and opens edit for the new name', async () => {
    const onChange = vi.fn();
    const onEditCategory = vi.fn();
    const user = userEvent.setup();
    vi.spyOn(window, 'prompt').mockReturnValue('Ramp');
    const deck: DeckDocument = {
      ...cubeDoc,
      categories: [
        { name: 'White', includedInDeck: true, includedInPrice: true, target: null },
      ],
    };

    render(
      <CategorySettingsPanel
        deck={deck}
        onChange={onChange}
        onClose={vi.fn()}
        onEditCategory={onEditCategory}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Add category/i }));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0] as DeckDocument;
    expect(last.categories.some((c) => c.name === 'Ramp')).toBe(true);
    expect(onEditCategory).toHaveBeenCalledWith('Ramp');
  });
});

describe('CategoryEditDialog', () => {
  it('saves target with auto-seed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const deck: DeckDocument = {
      ...cubeDoc,
      format: 'cube',
      categories: [
        { name: 'White', includedInDeck: true, includedInPrice: true, target: null },
        { name: 'Blue', includedInDeck: true, includedInPrice: true, target: null },
      ],
      cards: [
        {
          ...cubeDoc.cards[0],
          instanceId: 'w1',
          primaryCategory: 'White',
          categories: ['White'],
        },
        {
          ...cubeDoc.cards[0],
          instanceId: 'u1',
          primaryCategory: 'Blue',
          categories: ['Blue'],
        },
      ],
    };

    render(
      <CategoryEditDialog
        deck={deck}
        categoryName="White"
        onChange={onChange}
        onClose={vi.fn()}
        onOpenReorder={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Included in price/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Target for White/i), {
      target: { value: '40' },
    });
    await user.click(screen.getByRole('button', { name: /^Save$/i }));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0] as DeckDocument;
    expect(last.categories.find((c) => c.name === 'White')?.target).toBe(40);
    expect(last.categories.find((c) => c.name === 'Blue')?.target).toBe(1);
  });

  it('clicking Current sets target to card count', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const deck: DeckDocument = {
      ...cubeDoc,
      format: 'cube',
      categories: [
        { name: 'White', includedInDeck: true, includedInPrice: true, target: null },
        { name: 'Blue', includedInDeck: true, includedInPrice: true, target: null },
      ],
      cards: [
        {
          ...cubeDoc.cards[0],
          instanceId: 'w1',
          primaryCategory: 'White',
          categories: ['White'],
        },
        {
          ...cubeDoc.cards[0],
          instanceId: 'w2',
          primaryCategory: 'White',
          categories: ['White'],
        },
        {
          ...cubeDoc.cards[0],
          instanceId: 'u1',
          primaryCategory: 'Blue',
          categories: ['Blue'],
        },
      ],
    };

    render(
      <CategoryEditDialog
        deck={deck}
        categoryName="White"
        onChange={onChange}
        onClose={vi.fn()}
        onOpenReorder={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Set target to 2 cards/i }));
    expect(screen.getByLabelText(/Target for White/i)).toHaveValue(2);

    await user.click(screen.getByRole('button', { name: /^Save$/i }));
    const last = onChange.mock.calls.at(-1)?.[0] as DeckDocument;
    expect(last.categories.find((c) => c.name === 'White')?.target).toBe(2);
    expect(last.categories.find((c) => c.name === 'Blue')?.target).toBe(1);
  });

  it('Reorder categories closes edit and opens settings', async () => {
    const onOpenReorder = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    const deck: DeckDocument = {
      ...cubeDoc,
      categories: [
        { name: 'White', includedInDeck: true, includedInPrice: true, target: null },
      ],
    };

    render(
      <CategoryEditDialog
        deck={deck}
        categoryName="White"
        onChange={vi.fn()}
        onClose={onClose}
        onOpenReorder={onOpenReorder}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Reorder categories/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenReorder).toHaveBeenCalled();
  });
});

describe('CategoryBrowse title edit', () => {
  it('opens edit via section title click', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <CategoryBrowse
        deck={commanderDoc}
        layout="grid"
        onEditCategory={onEdit}
      />,
    );
    const titleBtn = screen.getAllByRole('button', { name: /Edit /i })[0];
    expect(titleBtn).toBeTruthy();
    await user.click(titleBtn!);
    expect(onEdit).toHaveBeenCalled();
  });
});

describe('CardContextMenu secondary categories', () => {
  it('lists remove-from and add-secondary actions', async () => {
    const onRemoveSecondary = vi.fn();
    const onAddSecondary = vi.fn();
    const user = userEvent.setup();

    render(
      <CardContextMenu
        state={{ x: 10, y: 10, instanceId: 'c1' }}
        isCover={false}
        foil={false}
        foilEnabled
        proxy={false}
        secondaryCategories={['Ramp']}
        categoryOptions={['Land']}
        onClose={vi.fn()}
        onToggleFoil={vi.fn()}
        onToggleProxy={vi.fn()}
        onSetCover={vi.fn()}
        onClearCover={vi.fn()}
        onMove={vi.fn()}
        onChangePrinting={vi.fn()}
        onRemove={vi.fn()}
        onRemoveSecondary={onRemoveSecondary}
        onAddSecondary={onAddSecondary}
      />,
    );

    await user.click(screen.getByRole('menuitem', { name: /Remove from Ramp/i }));
    expect(onRemoveSecondary).toHaveBeenCalledWith('Ramp');
  });
});
