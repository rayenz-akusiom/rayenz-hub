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
  vi.unstubAllGlobals();
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

function deckWithIdentity(identity: string[] | null): DeckDocument {
  const deck = basicsDeck();
  const commander = {
    instanceId: 'test-commander', name: 'Test Commander', quantity: 1,
    primaryCategory: 'Commander', categories: ['Commander'], stack: null,
    setCode: null, collectorNumber: null, scryfallId: identity ? 'test-commander-sf' : null,
    archidektCardId: null, foil: false, proxy: false,
  };
  deck.cards = [...deck.cards, commander];
  if (identity) {
    deck.oracle = {
      ...deck.oracle,
      [oracleKey(commander)]: emptyCardOracle({
        scryfallId: commander.scryfallId,
        colourIdentity: identity as ('W' | 'U' | 'B' | 'R' | 'G')[],
        typeLine: 'Legendary Creature',
      }),
    };
  }
  return deck;
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
  it('disables every multicolour land button when commander identity is unknown or colourless', () => {
    const { rerender } = render(<BasicLandsPanel deck={deckWithIdentity(null)} onChange={vi.fn()} onClose={vi.fn()} />);
    const labels = ['Commander lands', 'True duals', 'Turbulent lands', 'Battlebond lands', 'Shock lands', 'Fetch lands', 'Triomes'];
    for (const label of labels) expect(screen.getByRole('button', { name: `Add ${label}` })).toBeDisabled();

    rerender(<BasicLandsPanel deck={deckWithIdentity([])} onChange={vi.fn()} onClose={vi.fn()} />);
    for (const label of labels) expect(screen.getByRole('button', { name: `Add ${label}` })).toBeDisabled();
  });

  it('enables cycle buttons according to the known identity width and matching combinations', () => {
    const { rerender } = render(<BasicLandsPanel deck={deckWithIdentity(['W'])} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add Commander lands' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add Fetch lands' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add True duals' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Triomes' })).toBeDisabled();

    rerender(<BasicLandsPanel deck={deckWithIdentity(['W', 'U'])} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add True duals' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add Triomes' })).toBeDisabled();

    rerender(<BasicLandsPanel deck={deckWithIdentity(['W', 'U', 'B'])} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add Triomes' })).toBeEnabled();

    rerender(<BasicLandsPanel deck={deckWithIdentity(['W', 'U', 'B', 'R', 'G'])} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add Triomes' })).toBeEnabled();
  });

  it('adds first available printing to Land and skips cards that cannot be found', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('q') || '';
      const name = query.match(/!"([^"]+)"/)?.[1] || '';
      if (name === 'Path of Ancestry') return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response(JSON.stringify({ data: [{
        id: `sf-${name.toLowerCase().replaceAll(' ', '-')}`, name, set: 'tst', collector_number: '1',
        type_line: 'Land', color_identity: [], finishes: ['nonfoil'],
      }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<BasicLandsPanel deck={deckWithIdentity(['W'])} onChange={onChange} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Add Commander lands' }));

    expect(await screen.findByText('Added 1; 1 card was unavailable.')).toBeInTheDocument();
    const updated = onChange.mock.calls[0]![0] as DeckDocument;
    const added = updated.cards.find((card) => card.name === 'Command Tower');
    expect(added).toMatchObject({ primaryCategory: 'Land', setCode: 'tst', collectorNumber: '1' });
    expect(updated.cards.some((card) => card.name === 'Path of Ancestry')).toBe(false);
    vi.unstubAllGlobals();
  });

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
