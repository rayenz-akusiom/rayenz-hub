import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDeckList,
  buildDeckFromImportText,
  hubDeckToRecord,
} from '../../../packages/web/src/deck-suggest/index.ts';
import { handoffSnapshotSummary } from '../../../packages/web/src/lib/hub-utils.ts';
import type { DeckDocument } from '@rayenz-hub/shared';
import { resetHubModules } from '../helpers/hubHarness.ts';

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('buildDeckFromImportText', () => {
  it('builds a deck with snapshot from import lines', () => {
    const text = '1x Sol Ring (cmm) 1 [Ramp]\n1x Lightning Bolt (mh2) 123 [Removal]';
    const deck = buildDeckFromImportText(text, { deck_name: 'Test deck' });
    expect(deck.deck_name).toBe('Test deck');
    expect(deck.deck_snapshot!.source).toBe('paste-import');
    expect(deck.deck_snapshot!.cards).toHaveLength(2);
    expect(deck.deck_snapshot!.cards![0].name).toBe('Sol Ring');
  });

  it('uses archidekt_url for deck id when provided', () => {
    const deck = buildDeckFromImportText('1x Sol Ring (cmm) 1 [Ramp]', {
      archidekt_url: 'https://archidekt.com/decks/3533613/baird',
    });
    expect(deck.deck_id).toBe('deck-3533613');
  });
});

describe('hubDeckToRecord', () => {
  it('projects formal swaps into Queued In/Out snapshot categories', () => {
    const doc = {
      schemaVersion: 1,
      deckId: 'hub-1',
      name: 'Test Commander',
      format: 'commander',
      archidektId: null,
      archidektUrl: 'https://archidekt.com/decks/1/test',
      categories: [],
      cards: [
        {
          instanceId: 'in-1',
          name: 'Sol Ring',
          quantity: 1,
          primaryCategory: 'Ramp',
          categories: [],
          stack: null,
          setCode: 'cmm',
          collectorNumber: '1',
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
        {
          instanceId: 'out-1',
          name: 'Arcane Signet',
          quantity: 1,
          primaryCategory: 'Ramp',
          categories: [],
          stack: null,
          setCode: 'cmm',
          collectorNumber: '2',
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
      ],
      oracle: {},
      formalSwapEntries: [
        {
          id: 'sw-1',
          inInstanceId: 'in-1',
          outInstanceId: 'out-1',
          inTargetCategory: null,
          sortIndex: 0,
          notes: null,
        },
      ],
      lookingForEntries: [],
      coverInstanceId: null,
      browseViewDefault: null,
      cardLayoutDefault: 'stacked',
      cardSortDefault: 'name_asc',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastArchidektSyncAt: null,
      lastArchidektImportAt: null,
      cubeTargetSize: null,
    } as DeckDocument;

    const record = hubDeckToRecord(doc);
    expect(record.deck_id).toBe('hub-1');
    expect(record.deck_snapshot!.source).toBe('hub-library');
    const byName = Object.fromEntries(
      (record.deck_snapshot!.cards || []).map((c) => [c.name, c.primary_category]),
    );
    expect(byName['Sol Ring']).toBe('Queued In');
    expect(byName['Arcane Signet']).toBe('Queued Out');
  });
});

describe('loadHubLibraryDecks', () => {
  it('skips theory commander decks', async () => {
    const { loadHubLibraryDecks } = await import('../../../packages/web/src/deck-suggest/data.ts');
    const store = await import('../../../packages/web/src/deck-builder/store/deck-store.ts');
    const owned = {
      schemaVersion: 1,
      deckId: 'owned-1',
      name: 'Owned',
      format: 'commander',
      ownership: 'owned',
      archidektId: null,
      archidektUrl: '',
      categories: [],
      cards: [],
      oracle: {},
      formalSwapEntries: [],
      lookingForEntries: [],
      coverInstanceId: null,
      browseViewDefault: null,
      cardLayoutDefault: 'stacked',
      cardSortDefault: 'name_asc',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastArchidektSyncAt: null,
      lastArchidektImportAt: null,
      cubeTargetSize: null,
    } as DeckDocument;
    const theory = { ...owned, deckId: 'theory-1', name: 'Theory', ownership: 'theory' as const };
    const listSpy = vi.spyOn(store, 'listDecks').mockResolvedValue([
      {
        deckId: 'owned-1',
        name: 'Owned',
        format: 'commander',
        ownership: 'owned',
        updatedAt: owned.updatedAt,
        archidektId: null,
      },
      {
        deckId: 'theory-1',
        name: 'Theory',
        format: 'commander',
        ownership: 'theory',
        updatedAt: theory.updatedAt,
        archidektId: null,
      },
    ] as never);
    const getSpy = vi.spyOn(store, 'getDeck').mockImplementation(async (id: string) => {
      if (id === 'owned-1') return owned;
      if (id === 'theory-1') return theory;
      return null;
    });
    try {
      const decks = await loadHubLibraryDecks();
      expect(decks.map((d) => d.deck_id)).toEqual(['owned-1']);
      expect(getSpy).not.toHaveBeenCalledWith('theory-1');
    } finally {
      listSpy.mockRestore();
      getSpy.mockRestore();
    }
  });
});

describe('applyDeckList', () => {
  it('selects all decks by default', () => {
    const result = applyDeckList(
      [
        { deck_id: 'd2', deck_name: 'Zebra' },
        { deck_id: 'd1', deck_name: 'Alpha' },
      ],
      { folderUrl: '', decks: [], selectedIds: [] },
    );
    expect(result.decks.map((d) => d.deck_name)).toEqual(['Alpha', 'Zebra']);
    expect(result.selectedIds).toEqual(['d1', 'd2']);
  });
});

describe('handoffSnapshotSummary', () => {
  it('counts reviewable decks with snapshots', () => {
    const summary = handoffSnapshotSummary({
      decks: [
        {
          suggestions: [{ suggestion_id: 's1' }],
          deck_snapshot: { cards: [{ name: 'A' }] },
        },
        {
          suggestions: [],
          deck_snapshot: null,
        },
        {
          suggestions: [{ suggestion_id: 's2' }],
          deck_snapshot: null,
        },
      ],
    });
    expect(summary.reviewable).toBe(2);
    expect(summary.withSnapshots).toBe(1);
    expect(summary.missingSnapshots).toBe(1);
    expect(summary.allReady).toBe(false);
  });
});
