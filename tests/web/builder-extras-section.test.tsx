import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardInstance, DeckDocument } from '@rayenz-hub/shared';
import { clearExtrasCache } from '@rayenz-hub/shared';
import { CategoryBrowse } from '../../packages/web/src/deck-builder/browse/CategoryBrowse';
import { PlaneswalkerSubtypeBrowse } from '../../packages/web/src/deck-builder/collection/PlaneswalkerSubtypeBrowse';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

afterEach(() => {
  cleanup();
  clearExtrasCache();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  clearExtrasCache();
});

function mockCollectionFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as {
        identifiers: { id: string }[];
      };
      const ids = (body.identifiers || []).map((x) => String(x.id || '').toLowerCase());
      const data: unknown[] = [];
      if (ids.includes('pw-1')) {
        data.push({
          id: 'pw-1',
          name: 'Jace Beleren',
          set: 'm10',
          collector_number: '68',
          type_line: 'Legendary Planeswalker — Jace',
          layout: 'normal',
          all_parts: [
            {
              id: 'emb-1',
              component: 'combo_piece',
              name: 'Jace Emblem',
              type_line: 'Emblem — Jace',
            },
          ],
        });
      }
      if (ids.includes('cmd-sf')) {
        data.push({
          id: 'cmd-sf',
          name: 'Token Maker',
          set: 'mh3',
          collector_number: '1',
          type_line: 'Creature',
          layout: 'normal',
          all_parts: [
            {
              id: 'tok-1',
              component: 'token',
              name: 'Soldier',
              type_line: 'Token Creature — Soldier',
            },
          ],
        });
      }
      if (ids.includes('emb-1')) {
        data.push({
          id: 'emb-1',
          name: 'Jace Emblem',
          set: 'tm10',
          collector_number: '1',
          type_line: 'Emblem — Jace',
          layout: 'emblem',
        });
      }
      if (ids.includes('tok-1')) {
        data.push({
          id: 'tok-1',
          name: 'Soldier',
          set: 'tmh3',
          collector_number: '1',
          type_line: 'Token Creature — Soldier',
          layout: 'token',
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data, not_found: [] }),
      };
    }),
  );
}

function collectionCard(
  partial: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'name'>,
): CardInstance {
  return {
    quantity: 1,
    ownedQuantity: 1,
    inDeckQuantity: 0,
    primaryCategory: 'Collection',
    categories: ['Collection'],
    stack: null,
    setCode: 'm10',
    collectorNumber: '68',
    scryfallId: 'pw-1',
    archidektCardId: null,
    foil: false,
    proxy: false,
    collectionSource: 'search',
    collectionIgnored: false,
    ...partial,
  };
}

describe('builder extras section', () => {
  it('shows Extras under commander category browse for main-deck tokens', async () => {
    mockCollectionFetch();
    const base = commanderFixture as DeckDocument;
    const deck: DeckDocument = {
      ...base,
      cards: [
        {
          ...base.cards[0]!,
          scryfallId: 'cmd-sf',
          name: 'Token Maker',
        },
      ],
      oracle: {
        'id:cmd-sf': {
          scryfallId: 'cmd-sf',
          colourIdentity: ['W'],
          colours: null,
          typeLine: 'Creature',
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: 1,
          imageUrl: null,
          finishes: null,
          hasCommonPrinting: null,
          manaCost: '{W}',
          producedMana: [],
          updatedAt: null,
        },
      },
    };

    render(<CategoryBrowse deck={deck} layout="grid" />);

    await waitFor(() => {
      expect(screen.getByTestId('db-extras-section')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Extras/i })).toBeInTheDocument();
    expect(screen.getByAltText(/Soldier/i)).toBeInTheDocument();
  });

  it('keeps Extras in grid layout when browse is stacked', async () => {
    mockCollectionFetch();
    const base = commanderFixture as DeckDocument;
    const deck: DeckDocument = {
      ...base,
      cards: [
        {
          ...base.cards[0]!,
          scryfallId: 'cmd-sf',
          name: 'Token Maker',
        },
      ],
      oracle: {
        'id:cmd-sf': {
          scryfallId: 'cmd-sf',
          colourIdentity: ['W'],
          colours: null,
          typeLine: 'Creature',
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: 1,
          imageUrl: null,
          finishes: null,
          hasCommonPrinting: null,
          manaCost: '{W}',
          producedMana: [],
          updatedAt: null,
        },
      },
    };

    render(<CategoryBrowse deck={deck} layout="stacked" />);

    await waitFor(() => {
      expect(screen.getByTestId('db-extras-section')).toBeInTheDocument();
    });
    const extras = screen.getByTestId('db-extras-section');
    expect(extras.querySelector('.db-card-grid')).toBeTruthy();
    expect(extras.querySelector('.db-card-stack')).toBeNull();
  });

  it('shows Extras under planeswalker subtype browse', async () => {
    mockCollectionFetch();
    const now = new Date().toISOString();
    const deck: DeckDocument = {
      deckId: 'pw-binder',
      schemaVersion: 2,
      name: 'Planeswalkers',
      description: '',
      format: 'collection',
      ownership: 'owned',
      visibility: 'private',
      archidektId: null,
      archidektUrl: null,
      categories: [
        { name: 'Collection', includedInDeck: true, includedInPrice: true, target: null },
      ],
      cards: [
        collectionCard({
          instanceId: 'jace-1',
          name: 'Jace Beleren',
          scryfallId: 'pw-1',
        }),
      ],
      oracle: {
        'id:pw-1': {
          scryfallId: 'pw-1',
          colourIdentity: ['U'],
          colours: null,
          typeLine: 'Legendary Planeswalker — Jace',
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: 3,
          imageUrl: null,
          finishes: null,
          hasCommonPrinting: null,
          manaCost: '{1}{U}{U}',
          producedMana: [],
          updatedAt: null,
        },
      },
      formalSwapEntries: [],
      lookingForEntries: [],
      coverInstanceId: null,
      browseViewDefault: 'planeswalker_subtype',
      cardLayoutDefault: 'grid',
      cardSortDefault: 'name_asc',
      createdAt: now,
      updatedAt: now,
      lastArchidektSyncAt: null,
      lastArchidektImportAt: null,
      collectionTemplate: 'planeswalkers',
      collectionSearch: {
        query: 't:planeswalker',
        defaultQuantity: 1,
        lastSyncedAt: null,
        lastOpenedAt: null,
        latestReleaseDate: null,
        suppressedKeys: [],
      },
      representativeCard: null,
    };

    render(<PlaneswalkerSubtypeBrowse deck={deck} layout="grid" />);

    await waitFor(() => {
      expect(screen.getByTestId('db-extras-section')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Extras/i })).toBeInTheDocument();
    expect(screen.getByAltText(/Jace Emblem/i)).toBeInTheDocument();
  });
});
