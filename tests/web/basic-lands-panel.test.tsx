import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyCardOracle, oracleKey, type DeckDocument } from '@rayenz-hub/shared';
import { BasicLandsPanel } from '../../packages/web/src/deck-builder/edit/BasicLandsPanel';
import { BrowseShell } from '../../packages/web/src/deck-builder/browse/BrowseShell';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

vi.mock('../../packages/web/src/deck-builder/scryfall/useScryfallEnrich', () => ({
  useScryfallEnrich: () => ({ enriching: false }),
}));

vi.mock('../../packages/web/src/deck-suggest/data', () => ({
  readProfileForDeck: vi.fn(async () => null),
}));

vi.mock('../../packages/web/src/mtg/profile-sync', () => ({
  ProfileSync: {
    isConnected: vi.fn(async () => false),
    connectProfilesDir: vi.fn(async () => {}),
    readProfileYaml: vi.fn(async () => null),
  },
}));

vi.mock('../../packages/web/src/deck-builder/scryfall/PrintingPickerModal', () => ({
  PrintingPickerModal: ({
    title,
    onClose,
  }: {
    title: string;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={title}>
      <button type="button" onClick={onClose}>
        Close picker
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  localStorage.removeItem('rayenzHubPickerCardSize');
});

const commanderDoc = commanderFixture as DeckDocument;

function basicsDeck(): DeckDocument {
  return {
    ...commanderDoc,
    autoAdjustBasics: false,
    categories: (commanderDoc.categories || []).map((c) =>
      c.name === 'Land' ? { ...c, target: 36 } : c,
    ),
    cards: commanderDoc.cards.map((c) =>
      c.instanceId === 'c2'
        ? {
            ...c,
            quantity: 4,
            foil: false,
            proxy: false,
            scryfallId: 'sf-forest',
          }
        : { ...c, foil: false, proxy: false },
    ),
  };
}

function diagnosticsDeck(): DeckDocument {
  const now = new Date().toISOString();
  const commander = {
    instanceId: 'cmd',
    name: 'Kenrith',
    quantity: 1,
    ownedQuantity: 0,
    inDeckQuantity: 0,
    primaryCategory: 'Commander',
    categories: ['Commander'],
    stack: null,
    setCode: 'eld',
    collectorNumber: '303',
    scryfallId: 'sf-cmd',
    archidektCardId: null,
    foil: false,
    proxy: false,
  };
  const triome = {
    instanceId: 'land1',
    name: 'Savai Triome',
    quantity: 1,
    ownedQuantity: 0,
    inDeckQuantity: 0,
    primaryCategory: 'Land',
    categories: ['Land'],
    stack: null,
    setCode: 'iko',
    collectorNumber: '253',
    scryfallId: 'sf-triome',
    archidektCardId: null,
    foil: false,
    proxy: false,
  };
  const plains = {
    instanceId: 'plains1',
    name: 'Plains',
    quantity: 2,
    ownedQuantity: 0,
    inDeckQuantity: 0,
    primaryCategory: 'Land',
    categories: ['Land'],
    stack: null,
    setCode: 'm12',
    collectorNumber: '229',
    scryfallId: 'sf-plains',
    archidektCardId: null,
    foil: false,
    proxy: false,
  };
  const spell = {
    instanceId: 'spell1',
    name: 'Irregular Cohort',
    quantity: 1,
    ownedQuantity: 0,
    inDeckQuantity: 0,
    primaryCategory: 'Other',
    categories: ['Other'],
    stack: null,
    setCode: 'clb',
    collectorNumber: '696',
    scryfallId: 'sf-spell',
    archidektCardId: null,
    foil: false,
    proxy: false,
  };
  return {
    schemaVersion: 2,
    deckId: 'diag-1',
    name: 'Diagnostics',
    format: 'commander',
    ownership: 'owned',
    visibility: 'public',
    archidektId: null,
    archidektUrl: null,
    categories: [
      { name: 'Commander', includedInDeck: true, includedInPrice: true, target: 1 },
      { name: 'Land', includedInDeck: true, includedInPrice: true, target: 5 },
      { name: 'Other', includedInDeck: true, includedInPrice: true, target: null },
    ],
    cards: [commander, triome, plains, spell],
    oracle: {
      [oracleKey(commander)]: emptyCardOracle({
        scryfallId: commander.scryfallId,
        colourIdentity: ['W', 'U', 'B', 'R', 'G'],
        typeLine: 'Legendary Creature',
        manaCost: '{W}{U}{B}{R}{G}',
        producedMana: [],
      }),
      [oracleKey(triome)]: emptyCardOracle({
        scryfallId: triome.scryfallId,
        colourIdentity: ['W', 'B', 'R'],
        typeLine: 'Land',
        manaCost: '',
        producedMana: ['W', 'B', 'R'],
      }),
      [oracleKey(plains)]: emptyCardOracle({
        scryfallId: plains.scryfallId,
        colourIdentity: ['W'],
        typeLine: 'Basic Land — Plains',
        manaCost: '',
        producedMana: ['W'],
      }),
      [oracleKey(spell)]: emptyCardOracle({
        scryfallId: spell.scryfallId,
        colourIdentity: ['W'],
        typeLine: 'Creature',
        manaCost: '{2}{W}{W}',
        producedMana: [],
      }),
    },
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: 'category',
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: now,
    updatedAt: now,
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
    autoAdjustBasics: true,
    description: '',
  };
}

describe('BasicLandsPanel', () => {
  it('shows land status, size picker, and updates quantity via stepper', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const deck = basicsDeck();

    render(<BasicLandsPanel deck={deck} onChange={onChange} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Basic lands' })).toBeInTheDocument();
    expect(screen.getByText(/Lands \d+ \/ 36/i)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Card size' })).toBeInTheDocument();

    const qtyGroup = screen.getByRole('group', { name: /Forest M12 #246 quantity/i });
    await user.click(within(qtyGroup).getByRole('button', { name: 'Increase quantity' }));

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as DeckDocument;
    expect(next.cards.find((c) => c.instanceId === 'c2')?.quantity).toBe(5);
  });

  it('opens printing picker when the card image is clicked', async () => {
    const user = userEvent.setup();
    render(<BasicLandsPanel deck={basicsDeck()} onChange={vi.fn()} onClose={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: /Change printing — Forest M12 #246/i }),
    );
    expect(
      screen.getByRole('dialog', { name: /Change printing — Forest/i }),
    ).toBeInTheDocument();
  });

  it('opens add picker from type buttons and supports snow toggle', async () => {
    const user = userEvent.setup();
    render(<BasicLandsPanel deck={basicsDeck()} onChange={vi.fn()} onClose={vi.fn()} />);

    const addGroup = screen.getByRole('group', { name: 'Add basic printing' });
    expect(within(addGroup).getByRole('button', { name: 'Forest' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Snow' }));
    expect(
      within(addGroup).getByRole('button', { name: 'Forest' }),
    ).toBeInTheDocument();

    await user.click(within(addGroup).getByRole('button', { name: 'Forest' }));
    expect(
      screen.getByRole('dialog', { name: /Add printing — Snow-Covered Forest/i }),
    ).toBeInTheDocument();
  });

  it('removes a stack when quantity is decreased to zero', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const deck: DeckDocument = {
      ...basicsDeck(),
      cards: basicsDeck().cards.map((c) =>
        c.instanceId === 'c2' ? { ...c, quantity: 1 } : c,
      ),
    };

    render(<BasicLandsPanel deck={deck} onChange={onChange} onClose={vi.fn()} />);

    const qtyGroup = screen.getByRole('group', { name: /quantity/i });
    await user.click(within(qtyGroup).getByRole('button', { name: 'Decrease quantity' }));

    const next = onChange.mock.calls[0]![0] as DeckDocument;
    expect(next.cards.find((c) => c.instanceId === 'c2')).toBeUndefined();
  });

  it('toggles auto-adjust and updates target lands', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<BasicLandsPanel deck={basicsDeck()} onChange={onChange} onClose={vi.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: /Auto-adjust basics/i }));
    expect(onChange).toHaveBeenCalled();
    expect((onChange.mock.calls.at(-1)![0] as DeckDocument).autoAdjustBasics).toBe(true);

    onChange.mockClear();
    const target = screen.getByRole('spinbutton', { name: 'Target land count' });
    fireEvent.change(target, { target: { value: '40' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0] as DeckDocument;
    expect(next.categories.find((c) => c.name === 'Land')?.target).toBe(40);
  });

  it('recalculate button forces auto basics', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const deck = {
      ...basicsDeck(),
      autoAdjustBasics: false,
    };
    render(<BasicLandsPanel deck={deck} onChange={onChange} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Recalculate' }));
    expect(onChange).toHaveBeenCalled();
  });

  it('shows auto basics diagnostics for coloured commander decks', () => {
    render(<BasicLandsPanel deck={diagnosticsDeck()} onChange={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText(/Land sources/i)).toBeInTheDocument();
    expect(screen.getByText(/source minimums \+ pip ratio/i)).toBeInTheDocument();
    expect(screen.getByText(/White/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Driver/i).length).toBeGreaterThan(0);
  });
});

describe('BrowseShell Basics panel', () => {
  it('opens Basics… and shows the panel', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={basicsDeck()} onChange={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Deck actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Basics…' }));
    expect(screen.getByRole('dialog', { name: 'Basic lands' })).toBeInTheDocument();
    expect(screen.getByText(/Lands \d+ \/ 36/i)).toBeInTheDocument();
  });
});
