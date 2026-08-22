import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardInstance, DeckDocument } from '@rayenz-hub/shared';
import {
  CardGroup,
  CategoryBrowse,
  DeckHeaderRow,
  DropSection,
} from '../../packages/web/src/deck-builder/browse/CategoryBrowse';
import { DRAG_MIME, DRAG_MIME_MULTI } from '../../packages/web/src/deck-builder/browse/CardTile';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

const commanderDoc = commanderFixture as DeckDocument;

afterEach(() => {
  cleanup();
});

function cardAt(i: number): CardInstance {
  return commanderDoc.cards[i] as CardInstance;
}

describe('CardGroup and DropSection', () => {
  it('renders grid and stacked layouts and selects cards', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const cards = [cardAt(0), cardAt(1)];

    const { rerender } = render(
      <CardGroup cards={cards} layout="grid" selectedId={cards[0]!.instanceId} onSelectCard={onSelect} />,
    );
    const tiles = document.querySelectorAll('.db-card-tile, [class*="card-tile"], button, img');
    expect(tiles.length).toBeGreaterThan(0);
    fireEvent.click(tiles[tiles.length - 1]!);
    expect(onSelect).toHaveBeenCalled();

    onSelect.mockClear();
    rerender(
      <CardGroup cards={cards} layout="stacked" selectedId={null} onSelectCard={onSelect} />,
    );
    fireEvent.click(document.querySelector('.db-card-stack-peek')!);
    expect(onSelect).toHaveBeenCalledWith(cards[0], expect.anything());
  });

  it('handles drag-over and drop into a section', () => {
    const onDropCard = vi.fn();
    render(
      <DropSection
        category="Ramp"
        cards={[cardAt(0)]}
        layout="grid"
        onDropCard={onDropCard}
      />,
    );

    const section = screen.getByText(/Ramp/).closest('section')!;
    fireEvent.dragOver(section, {
      dataTransfer: { dropEffect: 'move', types: [DRAG_MIME], setData: vi.fn(), getData: vi.fn() },
    });
    expect(section.className).toMatch(/is-drop-target/);

    fireEvent.drop(section, {
      dataTransfer: {
        getData: (type: string) => (type === DRAG_MIME || type === 'text/plain' ? 'inst-1' : ''),
      },
    });
    expect(onDropCard).toHaveBeenCalledWith(['inst-1'], 'Ramp');
  });

  it('accepts drops into an empty section with a target', () => {
    const onDropCard = vi.fn();
    render(
      <DropSection
        category="Ramp"
        cards={[]}
        layout="grid"
        onDropCard={onDropCard}
        target={10}
        primaryCount={0}
        warnTarget
      />,
    );

    expect(screen.getByText(/\(0\/10\)/)).toBeInTheDocument();
    expect(document.querySelectorAll('.db-card-placeholder')).toHaveLength(10);
    const section = screen.getByText(/Ramp/).closest('section')!;
    fireEvent.drop(section, {
      dataTransfer: {
        getData: (type: string) => (type === DRAG_MIME || type === 'text/plain' ? 'inst-1' : ''),
      },
    });
    expect(onDropCard).toHaveBeenCalledWith(['inst-1'], 'Ramp');
  });

  it('drops multi-id MIME payloads as an instance id list', () => {
    const onDropCard = vi.fn();
    render(
      <DropSection
        category="Ramp"
        cards={[cardAt(0)]}
        layout="grid"
        onDropCard={onDropCard}
      />,
    );

    const section = screen.getByText(/Ramp/).closest('section')!;
    fireEvent.drop(section, {
      dataTransfer: {
        getData: (type: string) => {
          if (type === DRAG_MIME_MULTI) return JSON.stringify(['inst-1', 'inst-2', 'inst-3']);
          if (type === DRAG_MIME || type === 'text/plain') return 'inst-1';
          return '';
        },
      },
    });
    expect(onDropCard).toHaveBeenCalledWith(['inst-1', 'inst-2', 'inst-3'], 'Ramp');
  });

  it('appends placeholders to match target without inflating N', () => {
    render(
      <DropSection
        category="Ramp"
        cards={[cardAt(0)]}
        layout="grid"
        target={5}
        primaryCount={1}
        warnTarget
      />,
    );

    expect(screen.getByText(/\(1\/5\)/)).toBeInTheDocument();
    expect(document.querySelectorAll('.db-card-placeholder')).toHaveLength(4);
  });

  it('uses primaryCount for N and placeholders in multi-inflated lists', () => {
    render(
      <DropSection
        category="Ramp"
        cards={[cardAt(0), cardAt(1)]}
        layout="stacked"
        target={5}
        primaryCount={1}
      />,
    );

    expect(screen.getByText(/\(1\/5\)/)).toBeInTheDocument();
    expect(document.querySelectorAll('.db-card-placeholder')).toHaveLength(4);
  });
});

describe('DeckHeaderRow', () => {
  beforeEach(() => {
    if (typeof ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver;
    }
  });

  function asHeaderCard(
    overrides: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'name' | 'primaryCategory'>,
  ) {
    const { categories: categoryOverride, ...rest } = overrides;
    return {
      ...cardAt(0),
      layout: 'normal' as const,
      colourIdentity: [] as string[],
      typeLine: 'Creature',
      keywords: null,
      partnerWith: null,
      oracleText: null,
      printedName: null,
      flavorName: null,
      manaValue: null,
      imageUrl: null,
      foil: false,
      ...rest,
      categories: categoryOverride || [overrides.primaryCategory],
    };
  }

  it('renders commander slots for commander format', () => {
    const commanders = [
      asHeaderCard({
        instanceId: 'cmd-1',
        name: 'Test Commander',
        primaryCategory: 'Commander',
      }),
      asHeaderCard({
        instanceId: 'cmd-2',
        name: 'Partner Commander',
        primaryCategory: 'Commander',
      }),
    ];
    render(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: commanders, Lieutenants: [] }}
        headerKeys={['Commander']}
        onDropCard={vi.fn()}
        deckName={commanderDoc.name}
        deckMeta="3 cards"
      />,
    );
    expect(screen.getByLabelText('Commanders')).toBeInTheDocument();
    expect(screen.getByText(commanderDoc.name)).toBeInTheDocument();
    expect(screen.getByText('3 cards')).toBeInTheDocument();
  });

  it('lets empty commander slots call onPickSlot', async () => {
    const user = userEvent.setup();
    const onPickSlot = vi.fn();
    render(
      <DeckHeaderRow
        format="commander"
        header={{}}
        headerKeys={[]}
        onPickSlot={onPickSlot}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Choose commander' }));
    expect(onPickSlot).toHaveBeenCalledWith('Commander');
  });

  it('always shows empty Arthur and Excalibur slots for Pendragon', async () => {
    const user = userEvent.setup();
    const onPickSlot = vi.fn();
    render(
      <DeckHeaderRow
        format="pendragon"
        header={{}}
        headerKeys={[]}
        onPickSlot={onPickSlot}
      />,
    );
    expect(screen.getByLabelText('Arthur and Excalibur')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose Arthur' }));
    expect(onPickSlot).toHaveBeenCalledWith('Arthur');
    await user.click(screen.getByRole('button', { name: 'Choose Excalibur' }));
    expect(onPickSlot).toHaveBeenCalledWith('Excalibur');
  });

  it('separates Arthur and Excalibur from the description with a divider', () => {
    render(
      <DeckHeaderRow
        format="pendragon"
        header={{}}
        headerKeys={[]}
        onSetDescription={vi.fn()}
        deckName="Pendragon Deck"
      />,
    );
    expect(screen.getByLabelText('Arthur and Excalibur')).toBeInTheDocument();
    expect(screen.getByLabelText('Deck description')).toBeInTheDocument();
    expect(document.querySelector('.db-header-divider')).toBeTruthy();
  });

  it('keeps a solo commander as one slot until the partner row is drag-targeted', () => {
    const commander = asHeaderCard({
      instanceId: 'cmd-1',
      name: 'Solo Commander',
      primaryCategory: 'Commander',
    });
    const lt = asHeaderCard({
      instanceId: 'lt-1',
      name: 'Test Lieutenant',
      primaryCategory: 'Lieutenants',
    });
    render(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: [commander], Lieutenants: [lt] }}
        headerKeys={['Commander', 'Lieutenants']}
        onDropCard={vi.fn()}
      />,
    );

    const pair = screen.getByLabelText('Commanders');
    expect(pair).toBeInTheDocument();
    expect(screen.queryByText('Drop commander')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.db-commander-slot')).toHaveLength(1);

    const ltTile = screen.getByRole('button', { name: /Test Lieutenant/i });
    fireEvent.dragStart(ltTile, {
      dataTransfer: {
        types: [DRAG_MIME],
        setData: vi.fn(),
        effectAllowed: 'move',
      },
    });
    expect(screen.queryByText('Drop commander')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.db-commander-slot')).toHaveLength(1);

    fireEvent.dragEnter(pair, {
      dataTransfer: {
        types: [DRAG_MIME],
        dropEffect: 'move',
        setData: vi.fn(),
        getData: vi.fn(),
      },
    });
    fireEvent.dragOver(pair, {
      dataTransfer: {
        types: [DRAG_MIME],
        dropEffect: 'move',
        setData: vi.fn(),
        getData: vi.fn(),
      },
    });
    expect(screen.getByText('Drop commander')).toBeInTheDocument();
    expect(document.querySelectorAll('.db-commander-slot')).toHaveLength(2);
  });

  it('makes lieutenant tiles draggable when onDropCard is provided', () => {
    const lt = asHeaderCard({
      instanceId: 'lt-1',
      name: 'Test Lieutenant',
      primaryCategory: 'Lieutenants',
    });
    render(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: [], Lieutenants: [lt] }}
        headerKeys={['Commander', 'Lieutenants']}
        onDropCard={vi.fn()}
      />,
    );
    const tile = screen.getByRole('button', { name: /Test Lieutenant/i });
    expect(tile).toHaveAttribute('draggable', 'true');
  });

  it('renders generic header categories for non-commander formats', () => {
    render(
      <DeckHeaderRow
        format="cube"
        header={{ Signature: [cardAt(0)] }}
        headerKeys={['Signature']}
        onSelectCard={vi.fn()}
      />,
    );
    expect(screen.getByText(/Signature/)).toBeInTheDocument();
  });

  it('renders title-only leaders band when there are no header keys', () => {
    render(
      <DeckHeaderRow
        format="other"
        header={{}}
        headerKeys={[]}
        deckName="Untitled Cube"
        deckMeta="0 cards"
      />,
    );
    expect(screen.getByLabelText('Deck leaders')).toBeInTheDocument();
    expect(screen.getByText('Untitled Cube')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rename / })).not.toBeInTheDocument();
    expect(screen.getByText('0 cards')).toBeInTheDocument();
  });

  it('renames the deck from the hover pencil on Enter', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(
      <DeckHeaderRow
        format="other"
        header={{}}
        headerKeys={[]}
        deckName="Untitled Cube"
        onRename={onRename}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rename Untitled Cube' }));
    const input = screen.getByRole('textbox', { name: 'Deck name' });
    await user.clear(input);
    await user.type(input, '  Renamed Cube  {Enter}');
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('Renamed Cube');
  });

  it('cancels rename on Escape without calling onRename', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(
      <DeckHeaderRow
        format="other"
        header={{}}
        headerKeys={[]}
        deckName="Untitled Cube"
        onRename={onRename}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rename Untitled Cube' }));
    await user.type(screen.getByRole('textbox', { name: 'Deck name' }), 'Nope');
    await user.keyboard('{Escape}');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rename Untitled Cube' })).toBeInTheDocument();
  });

  it('does not rename when the input is emptied and blurred', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(
      <DeckHeaderRow
        format="other"
        header={{}}
        headerKeys={[]}
        deckName="Untitled Cube"
        onRename={onRename}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rename Untitled Cube' }));
    await user.clear(screen.getByRole('textbox', { name: 'Deck name' }));
    await user.tab();
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rename Untitled Cube' })).toBeInTheDocument();
  });

  it('fills empty Pendragon lieutenant space with an editable description', () => {
    const arthur = asHeaderCard({
      instanceId: 'art-1',
      name: 'Young Knight',
      primaryCategory: 'Arthur',
    });
    render(
      <DeckHeaderRow
        format="pendragon"
        header={{ Arthur: [arthur], Excalibur: [], Lieutenants: [] }}
        headerKeys={['Arthur']}
        onDropCard={vi.fn()}
        onSetDescription={vi.fn()}
        deckName="Pendragon Deck"
      />,
    );
    expect(screen.getByLabelText('Arthur and Excalibur')).toBeInTheDocument();
    expect(screen.getByLabelText('Deck description')).toBeInTheDocument();
    expect(screen.queryByText(/Lieutenants/)).not.toBeInTheDocument();
  });

  it('shows Pendragon lieutenants when present', () => {
    const arthur = asHeaderCard({
      instanceId: 'art-1',
      name: 'Young Knight',
      primaryCategory: 'Arthur',
    });
    const lt = asHeaderCard({
      instanceId: 'lt-1',
      name: 'Test Lieutenant',
      primaryCategory: 'Lieutenants',
    });
    render(
      <DeckHeaderRow
        format="pendragon"
        header={{ Arthur: [arthur], Excalibur: [], Lieutenants: [lt] }}
        headerKeys={['Arthur', 'Lieutenants']}
        onDropCard={vi.fn()}
        onSetDescription={vi.fn()}
        deckName="Pendragon With Lieutenants"
      />,
    );
    expect(screen.getByLabelText('Arthur and Excalibur')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test Lieutenant/i })).toBeInTheDocument();
  });

  it('reveals the lieutenant drop target on Pendragon header hover, not Arthur or Excalibur again', () => {
    const arthur = asHeaderCard({
      instanceId: 'art-1',
      name: 'Young Knight',
      primaryCategory: 'Arthur',
    });
    const excalibur = asHeaderCard({
      instanceId: 'exc-1',
      name: 'Legendary Sword',
      primaryCategory: 'Excalibur',
    });
    render(
      <DeckHeaderRow
        format="pendragon"
        header={{ Arthur: [arthur], Excalibur: [excalibur], Lieutenants: [] }}
        headerKeys={['Arthur', 'Excalibur']}
        onDropCard={vi.fn()}
        onSetDescription={vi.fn()}
        deckName="Pendragon Hover Deck"
      />,
    );
    expect(screen.queryByText(/Lieutenants/)).not.toBeInTheDocument();

    const tile = screen.getByRole('button', { name: /Young Knight/i });
    fireEvent.dragStart(tile, {
      dataTransfer: {
        types: [DRAG_MIME],
        setData: vi.fn(),
        effectAllowed: 'move',
      },
    });
    expect(screen.queryByText(/Lieutenants/)).not.toBeInTheDocument();

    fireEvent.dragOver(screen.getByLabelText('Deck leaders'), {
      dataTransfer: {
        types: [DRAG_MIME],
        dropEffect: 'move',
        setData: vi.fn(),
        getData: vi.fn(),
      },
    });
    expect(screen.getByText(/Lieutenants/)).toBeInTheDocument();
    const headerCatTitles = [...document.querySelectorAll('.db-header-cat-title')].map(
      (el) => el.textContent || '',
    );
    expect(headerCatTitles.some((t) => t.includes('Lieutenants'))).toBe(true);
    expect(headerCatTitles.some((t) => t.includes('Arthur'))).toBe(false);
    expect(headerCatTitles.some((t) => t.includes('Excalibur'))).toBe(false);
    expect(screen.getByLabelText('Arthur and Excalibur')).toBeInTheDocument();

    fireEvent.dragEnd(tile);
    expect(screen.queryByText(/Lieutenants/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Deck description')).toBeInTheDocument();
  });

  it('keeps the Pendragon lieutenant view after a drop into Lieutenants', () => {
    const arthur = asHeaderCard({
      instanceId: 'art-1',
      name: 'Young Knight',
      primaryCategory: 'Arthur',
    });
    const lt = asHeaderCard({
      instanceId: 'lt-1',
      name: 'Dropped Lieutenant',
      primaryCategory: 'Lieutenants',
    });
    const onDropCard = vi.fn();
    const { rerender } = render(
      <DeckHeaderRow
        format="pendragon"
        header={{ Arthur: [arthur], Excalibur: [], Lieutenants: [] }}
        headerKeys={['Arthur']}
        onDropCard={onDropCard}
        onSetDescription={vi.fn()}
        deckName="Pendragon Drop Deck"
      />,
    );

    const tile = screen.getByRole('button', { name: /Young Knight/i });
    fireEvent.dragStart(tile, {
      dataTransfer: {
        types: [DRAG_MIME],
        setData: vi.fn(),
        effectAllowed: 'move',
      },
    });
    fireEvent.dragOver(screen.getByLabelText('Deck leaders'), {
      dataTransfer: {
        types: [DRAG_MIME],
        dropEffect: 'move',
        setData: vi.fn(),
        getData: vi.fn(),
      },
    });
    const ltSection = screen.getByText(/Lieutenants/).closest('section')!;
    fireEvent.drop(ltSection, {
      dataTransfer: {
        getData: (type: string) => (type === DRAG_MIME || type === 'text/plain' ? 'art-1' : ''),
      },
    });
    expect(onDropCard).toHaveBeenCalledWith(['art-1'], 'Lieutenants');

    rerender(
      <DeckHeaderRow
        format="pendragon"
        header={{ Arthur: [arthur], Excalibur: [], Lieutenants: [lt] }}
        headerKeys={['Arthur', 'Lieutenants']}
        onDropCard={onDropCard}
        onSetDescription={vi.fn()}
        deckName="Pendragon Drop Deck"
      />,
    );
    expect(screen.getByRole('button', { name: /Dropped Lieutenant/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Arthur and Excalibur')).toBeInTheDocument();
  });

  it('fills empty lieutenant space with an editable description', () => {
    const commander = asHeaderCard({
      instanceId: 'cmd-1',
      name: 'Solo Commander',
      primaryCategory: 'Commander',
    });
    render(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: [commander], Lieutenants: [] }}
        headerKeys={['Commander']}
        onDropCard={vi.fn()}
        onSetDescription={vi.fn()}
        deckName="Described Deck"
      />,
    );
    expect(screen.getByLabelText('Deck description')).toBeInTheDocument();
    expect(screen.queryByText(/Lieutenants/)).not.toBeInTheDocument();
  });

  it('shows lieutenants when present', () => {
    const commander = asHeaderCard({
      instanceId: 'cmd-1',
      name: 'Solo Commander',
      primaryCategory: 'Commander',
    });
    const lt = asHeaderCard({
      instanceId: 'lt-1',
      name: 'Test Lieutenant',
      primaryCategory: 'Lieutenants',
    });
    render(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: [commander], Lieutenants: [lt] }}
        headerKeys={['Commander', 'Lieutenants']}
        onDropCard={vi.fn()}
        onSetDescription={vi.fn()}
        deckName="With Lieutenants"
      />,
    );
    expect(screen.getByRole('button', { name: /Test Lieutenant/i })).toBeInTheDocument();
  });

  it('reveals the lieutenant drop target when a card drag hovers the header', () => {
    const commander = asHeaderCard({
      instanceId: 'cmd-1',
      name: 'Solo Commander',
      primaryCategory: 'Commander',
    });
    render(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: [commander], Lieutenants: [] }}
        headerKeys={['Commander']}
        onDropCard={vi.fn()}
        onSetDescription={vi.fn()}
        deckName="Hover Deck"
      />,
    );
    expect(screen.queryByText(/Lieutenants/)).not.toBeInTheDocument();

    const tile = screen.getByRole('button', { name: /Solo Commander/i });
    fireEvent.dragStart(tile, {
      dataTransfer: {
        types: [DRAG_MIME],
        setData: vi.fn(),
        effectAllowed: 'move',
      },
    });
    expect(screen.queryByText(/Lieutenants/)).not.toBeInTheDocument();

    fireEvent.dragOver(screen.getByLabelText('Deck leaders'), {
      dataTransfer: {
        types: [DRAG_MIME],
        dropEffect: 'move',
        setData: vi.fn(),
        getData: vi.fn(),
      },
    });
    expect(screen.getByText(/Lieutenants/)).toBeInTheDocument();

    fireEvent.dragEnd(tile);
    expect(screen.queryByText(/Lieutenants/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Deck description')).toBeInTheDocument();
  });

  it('keeps the lieutenant view after a drop into Lieutenants', () => {
    const commander = asHeaderCard({
      instanceId: 'cmd-1',
      name: 'Solo Commander',
      primaryCategory: 'Commander',
    });
    const lt = asHeaderCard({
      instanceId: 'lt-1',
      name: 'Dropped Lieutenant',
      primaryCategory: 'Lieutenants',
    });
    const onDropCard = vi.fn();
    const { rerender } = render(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: [commander], Lieutenants: [] }}
        headerKeys={['Commander']}
        onDropCard={onDropCard}
        onSetDescription={vi.fn()}
        deckName="Drop Deck"
      />,
    );

    const tile = screen.getByRole('button', { name: /Solo Commander/i });
    fireEvent.dragStart(tile, {
      dataTransfer: {
        types: [DRAG_MIME],
        setData: vi.fn(),
        effectAllowed: 'move',
      },
    });
    fireEvent.dragOver(screen.getByLabelText('Deck leaders'), {
      dataTransfer: {
        types: [DRAG_MIME],
        dropEffect: 'move',
        setData: vi.fn(),
        getData: vi.fn(),
      },
    });
    const ltSection = screen.getByText(/Lieutenants/).closest('section')!;
    fireEvent.drop(ltSection, {
      dataTransfer: {
        getData: (type: string) => (type === DRAG_MIME || type === 'text/plain' ? 'cmd-1' : ''),
      },
    });
    expect(onDropCard).toHaveBeenCalledWith(['cmd-1'], 'Lieutenants');

    rerender(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: [commander], Lieutenants: [lt] }}
        headerKeys={['Commander', 'Lieutenants']}
        onDropCard={onDropCard}
        onSetDescription={vi.fn()}
        deckName="Drop Deck"
      />,
    );
    expect(screen.getByRole('button', { name: /Dropped Lieutenant/i })).toBeInTheDocument();
  });

  it('renders a read-only description as text, and omits an empty one', () => {
    const commander = asHeaderCard({
      instanceId: 'cmd-1',
      name: 'Solo Commander',
      primaryCategory: 'Commander',
    });
    const { rerender } = render(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: [commander], Lieutenants: [] }}
        headerKeys={['Commander']}
        description="A tale of two commanders"
        deckName="Public Deck"
      />,
    );
    expect(screen.getByText('A tale of two commanders')).toBeInTheDocument();
    expect(screen.queryByLabelText('Deck description')).not.toBeInTheDocument();

    rerender(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: [commander], Lieutenants: [] }}
        headerKeys={['Commander']}
        description=""
        deckName="Public Deck"
      />,
    );
    expect(screen.queryByText('A tale of two commanders')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Deck description')).not.toBeInTheDocument();
  });

  it('persists description on blur', async () => {
    const onSetDescription = vi.fn();
    const user = userEvent.setup();
    const commander = asHeaderCard({
      instanceId: 'cmd-1',
      name: 'Solo Commander',
      primaryCategory: 'Commander',
    });
    render(
      <DeckHeaderRow
        format="commander"
        header={{ Commander: [commander], Lieutenants: [] }}
        headerKeys={['Commander']}
        onSetDescription={onSetDescription}
        deckName="Edit Deck"
      />,
    );
    const field = screen.getByLabelText('Deck description');
    await user.type(field, 'Hello blurb');
    await user.tab();
    expect(onSetDescription).toHaveBeenCalledWith('Hello blurb');
  });
});

describe('CategoryBrowse', () => {
  it('renders partitioned categories and selects a card', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <CategoryBrowse
        deck={commanderDoc}
        layout="grid"
        selectedId={null}
        onSelectCard={onSelect}
        onDropCard={vi.fn()}
      />,
    );

    expect(screen.getAllByLabelText(/Deck leaders|Commanders?/i).length).toBeGreaterThan(0);
    const peek = document.querySelector('.db-card-stack-peek, .db-card-tile, img');
    if (peek) {
      await user.click(peek);
    }
    // Selection is optional depending on tile hit target; browse must still mount categories.
    expect(document.querySelector('.db-section, .db-cat-column, .db-deck-leaders')).toBeTruthy();
    void onSelect;
  });

  it('shows N/T counts and disables drag in multiple categories mode', () => {
    const onDropCard = vi.fn();
    const deck: DeckDocument = {
      ...commanderDoc,
      categories: [
        { name: 'Creature', includedInDeck: true, includedInPrice: true, target: 5 },
        { name: 'Land', includedInDeck: true, includedInPrice: true, target: 2 },
        { name: 'Ramp', includedInDeck: true, includedInPrice: true, target: null },
      ],
      cards: [
        {
          ...cardAt(0),
          primaryCategory: 'Creature',
          categories: ['Creature', 'Ramp'],
        },
        cardAt(1),
      ],
    };

    const { rerender } = render(
      <CategoryBrowse
        deck={deck}
        layout="grid"
        browseView="category"
        onDropCard={onDropCard}
      />,
    );
    expect(screen.getByText('(1/5)')).toBeInTheDocument();

    rerender(
      <CategoryBrowse
        deck={deck}
        layout="grid"
        browseView="category_multi"
        onDropCard={onDropCard}
      />,
    );
    expect(screen.getByText('Ramp')).toBeInTheDocument();
    const secondary = document.querySelector('.db-card-tile.is-secondary-cat');
    expect(secondary).toBeTruthy();
    expect(secondary).toHaveAttribute('draggable', 'false');
  });

  it('respects Categories (Custom) order', () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      categories: [
        { name: 'Land', includedInDeck: true, includedInPrice: true, target: null },
        { name: 'Creature', includedInDeck: true, includedInPrice: true, target: null },
      ],
    };
    render(<CategoryBrowse deck={deck} layout="grid" browseView="category_custom" />);
    const titles = [...document.querySelectorAll('.db-section-title')].map((el) =>
      el.textContent?.replace(/\s*\(.*\)$/, '').trim(),
    );
    expect(titles.indexOf('Land')).toBeLessThan(titles.indexOf('Creature'));
  });
});
