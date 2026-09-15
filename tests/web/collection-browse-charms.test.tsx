import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { CardInstance, DeckDocument } from '@rayenz-hub/shared';
import { CollectionBrowseShell } from '../../packages/web/src/deck-builder/collection/CollectionBrowseShell';

vi.mock('../../packages/web/src/lib/hub-progress', () => ({
  HubProgress: {
    mount: () => ({
      start: vi.fn(),
      update: vi.fn(),
      finish: vi.fn(),
      dismiss: vi.fn(),
      isActive: () => false,
      isFinished: () => false,
    }),
  },
}));

vi.mock('../../packages/web/src/deck-builder/collection/collection-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-builder/collection/collection-sync')>();
  return {
    ...actual,
    syncCollectionFromSearch: vi.fn(async (deck: DeckDocument) => deck),
  };
});

function collectionCard(
  partial: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'name'>,
): CardInstance {
  return {
    quantity: 1,
    ownedQuantity: 0,
    inDeckQuantity: 0,
    primaryCategory: 'Collection',
    categories: ['Collection'],
    stack: null,
    setCode: 'm10',
    collectorNumber: '60',
    scryfallId: partial.instanceId,
    archidektCardId: null,
    foil: false,
    proxy: false,
    collectionSource: 'search',
    collectionIgnored: false,
    ...partial,
  };
}

function collectionDoc(defaultQuantity: number, ownedQuantity = 0): DeckDocument {
  const now = new Date().toISOString();
  return {
    deckId: 'collection-charms-1',
    schemaVersion: 2,
    name: 'Binder',
    description: '',
    format: 'collection',
    ownership: 'owned',
    visibility: 'private',
    archidektId: null,
    archidektUrl: null,
    categories: [{ name: 'Collection', includedInDeck: true, includedInPrice: true, target: null }],
    cards: [
      collectionCard({
        instanceId: 'pc1',
        name: 'Jace Beleren',
        quantity: 1,
        ownedQuantity,
      }),
    ],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: 'all_cards',
    cardLayoutDefault: 'grid',
    cardSortDefault: 'name_asc',
    createdAt: now,
    updatedAt: now,
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
    collectionTemplate: 'generic',
    collectionSearch: {
      query: 't:planeswalker',
      defaultQuantity,
      lastSyncedAt: now,
      lastOpenedAt: now,
      latestReleaseDate: null,
      suppressedKeys: [],
    },
    representativeCard: null,
    autoAdjustBasics: false,
  };
}

function Harness({ initial }: { initial: DeckDocument }) {
  const [deck, setDeck] = useState(initial);
  return <CollectionBrowseShell deck={deck} onChange={setDeck} onBack={() => {}} />;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('collection browse charms', () => {
  beforeEach(() => {
    localStorage.setItem('rayenz-deck-builder-card-charms', JSON.stringify({ enabled: true }));
  });

  it('toggles seeking from the charm when default target is 1', async () => {
    const user = userEvent.setup();
    render(<Harness initial={collectionDoc(1, 0)} />);
    await user.click(screen.getByRole('button', { name: 'Unmark seeking' }));
    expect(screen.getByRole('button', { name: 'Mark as seeking' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as proxy' })).not.toBeInTheDocument();
  });

  it('toggles foil from the charm and never shows a proxy charm', async () => {
    const user = userEvent.setup();
    render(<Harness initial={collectionDoc(1, 0)} />);
    await user.click(screen.getByRole('button', { name: 'Mark as foil' }));
    expect(screen.getByRole('button', { name: 'Unmark foil' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as proxy' })).not.toBeInTheDocument();
  });

  it('hides seeking charms when default target is not 1 but keeps foil', () => {
    render(<Harness initial={collectionDoc(2, 0)} />);
    expect(screen.getByRole('button', { name: 'Mark as foil' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unmark seeking' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as seeking' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as proxy' })).not.toBeInTheDocument();
  });

  it('does not ghost or mark the Binder cover as foil or seeking', () => {
    const deck: DeckDocument = {
      ...collectionDoc(1, 0),
      representativeCard: {
        name: 'Liliana of the Veil',
        scryfallId: 'liliana-cover',
        setCode: 'isd',
        collectorNumber: '105',
        foil: true,
        imageUrl: null,
        printedName: null,
        flavorName: null,
      },
    };
    render(<Harness initial={deck} />);

    const binder = screen.getByLabelText('Binder');
    const cover = within(binder).getByRole('button', { name: /Liliana of the Veil/i });
    expect(cover).not.toHaveClass('is-sought-ghost');
    expect(cover).not.toHaveClass('is-foil');
    expect(cover).not.toHaveClass('is-seeking');
    expect(cover).toHaveAttribute('title', 'Liliana of the Veil');
    expect(within(binder).queryByRole('button', { name: /foil/i })).not.toBeInTheDocument();
    expect(within(binder).queryByRole('button', { name: /seeking/i })).not.toBeInTheDocument();

    const inventory = screen.getByRole('button', { name: /Jace Beleren, sought/i });
    expect(inventory).toHaveClass('is-sought-ghost');
    expect(screen.getByRole('button', { name: 'Mark as foil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unmark seeking' })).toBeInTheDocument();
  });

  it('offers Clear Binder on the matching printing and never shows proxy in the context menu', async () => {
    const user = userEvent.setup();
    const deck: DeckDocument = {
      ...collectionDoc(1, 1),
      representativeCard: {
        name: 'Jace Beleren',
        scryfallId: 'pc1',
        setCode: 'm10',
        collectorNumber: '60',
        foil: false,
        imageUrl: null,
        printedName: null,
        flavorName: null,
      },
    };
    render(<Harness initial={deck} />);

    const binder = screen.getByLabelText('Binder');
    const inventory = screen
      .getAllByRole('button', { name: /^Jace Beleren$/i })
      .find((el) => !binder.contains(el));
    expect(inventory).toBeTruthy();
    await user.pointer({ keys: '[MouseRight>]', target: inventory! });

    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Clear Binder' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /proxy/i })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /cover/i })).not.toBeInTheDocument();
  });

  it("moves a card into the Won't collect lane without marking it collected", async () => {
    const user = userEvent.setup();
    render(<Harness initial={collectionDoc(1, 0)} />);

    const inventory = screen.getByRole('button', { name: /Jace Beleren, sought/i });
    await user.click(inventory);
    expect(screen.getByRole('heading', { name: /All Cards/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Won't collect/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Won't collect" }));

    expect(screen.getByRole('heading', { name: /Won't collect \(1\)/i })).toBeInTheDocument();
    const ignored = screen.getByRole('button', { name: /^Jace Beleren$/i });
    expect(ignored).toHaveClass('is-collection-ignored');
    expect(ignored).not.toHaveClass('is-sought-ghost');

    await user.click(ignored);
    expect(screen.getByRole('button', { name: 'Will collect' })).toBeInTheDocument();
    const stats = screen.getByText('Jace Beleren', { selector: 'strong' }).closest('.db-collection-stats');
    expect(stats).toBeTruthy();
    expect(within(stats as HTMLElement).getByLabelText('Owned')).toHaveValue(0);
  });
});
