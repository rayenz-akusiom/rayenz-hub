import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
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
