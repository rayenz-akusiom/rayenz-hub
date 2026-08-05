import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyDeckList,
  buildDeckFromImportText,
  hubDeckToRecord,
  parseDeckListFromText,
  resolveDeckLoadTab,
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

describe('parseDeckListFromText', () => {
  it('parses Archidekt URLs one per line', () => {
    const text = 'https://archidekt.com/decks/3533613/baird\n# comment\nhttps://archidekt.com/decks/99999';
    const decks = parseDeckListFromText(text);
    expect(decks).toHaveLength(2);
    expect(decks[0].deck_id).toBe('deck-3533613');
    expect(decks[0].deck_name).toBe('Baird');
    expect(decks[1].deck_id).toBe('deck-99999');
  });

  it('throws on invalid lines', () => {
    expect(() => parseDeckListFromText('not-a-url')).toThrow(/Invalid Archidekt/);
  });

  it('throws when empty', () => {
    expect(() => parseDeckListFromText('  \n# only comments\n')).toThrow(/at least one/);
  });
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

describe('resolveDeckLoadTab', () => {
  it('defaults to hub when no saved tab', () => {
    expect(resolveDeckLoadTab({ deckLoadTab: null }, {})).toBe('hub');
  });

  it('falls back to hub when folder saved but bridge unavailable', () => {
    expect(resolveDeckLoadTab({ deckLoadTab: null }, { deckLoadTab: 'folder' })).toBe('hub');
  });

  it('maps legacy paste tab to paste-urls', () => {
    expect(resolveDeckLoadTab({ deckLoadTab: null }, { deckLoadTab: 'paste' })).toBe('paste-urls');
  });

  it('keeps hub when explicitly saved', () => {
    expect(resolveDeckLoadTab({ deckLoadTab: null }, { deckLoadTab: 'hub' })).toBe('hub');
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
