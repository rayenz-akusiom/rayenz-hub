import { cleanup, render, screen } from '@testing-library/react';
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
});
