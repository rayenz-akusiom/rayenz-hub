import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyDeckList,
  buildDeckFromImportText,
  parseDeckListFromText,
  resolveDeckLoadTab,
} from '../../../packages/web/src/deck-suggest/index.ts';
import { handoffSnapshotSummary } from '../../../packages/web/src/lib/hub-utils.ts';
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
  it('defaults to paste-import when bridge is unavailable', () => {
    expect(resolveDeckLoadTab({ deckLoadTab: null }, {})).toBe('paste-import');
  });

  it('falls back to paste-import when folder saved but bridge unavailable', () => {
    expect(resolveDeckLoadTab({ deckLoadTab: null }, { deckLoadTab: 'folder' })).toBe('paste-import');
  });

  it('maps legacy paste tab to paste-urls', () => {
    expect(resolveDeckLoadTab({ deckLoadTab: null }, { deckLoadTab: 'paste' })).toBe('paste-urls');
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
