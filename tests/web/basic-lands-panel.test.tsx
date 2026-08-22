import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

afterEach(() => {
  cleanup();
  localStorage.removeItem('rayenzHubPickerCardSize');
});

const commanderDoc = commanderFixture as DeckDocument;

function basicsDeck(): DeckDocument {
  return {
    ...commanderDoc,
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
  it('shows totals and updates quantity via stepper', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const deck = basicsDeck();

    render(<BasicLandsPanel deck={deck} onChange={onChange} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Basic lands' })).toBeInTheDocument();
    expect(screen.getByText(/Total basics:/i)).toHaveTextContent('4');

    const forestSection = screen.getByRole('heading', { name: 'Forest' }).closest('section');
    expect(forestSection).toBeTruthy();
    const qtyGroup = within(forestSection!).getByRole('group', { name: /Forest M12 #246 quantity/i });
    await user.click(within(qtyGroup).getByRole('button', { name: 'Increase quantity' }));

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as DeckDocument;
    expect(next.cards.find((c) => c.instanceId === 'c2')?.quantity).toBe(5);
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

    const forestSection = screen.getByRole('heading', { name: 'Forest' }).closest('section');
    const qtyGroup = within(forestSection!).getByRole('group', { name: /quantity/i });
    await user.click(within(qtyGroup).getByRole('button', { name: 'Decrease quantity' }));

    const next = onChange.mock.calls[0]![0] as DeckDocument;
    expect(next.cards.find((c) => c.instanceId === 'c2')).toBeUndefined();
  });
});

describe('BrowseShell Basics panel', () => {
  it('opens Basics… and shows the panel', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={basicsDeck()} onChange={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Deck actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Basics…' }));
    expect(screen.getByRole('dialog', { name: 'Basic lands' })).toBeInTheDocument();
    expect(screen.getByText(/Total basics:/i)).toBeInTheDocument();
  });
});
