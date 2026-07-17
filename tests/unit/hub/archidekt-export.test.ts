import { describe, expect, it } from 'vitest';
import { ArchidektExport } from '../../../packages/web/src/mtg/archidekt-export.ts';

describe('ArchidektExport.parseImportLine', () => {
  it('round-trips a simple import line', () => {
    const line = ArchidektExport.formatImportLine(1, 'Sol Ring', 'cmm', '1', 'Ramp', null, null);
    const card = ArchidektExport.parseImportLine(line);
    expect(card).toMatchObject({
      name: 'Sol Ring',
      quantity: 1,
      set_code: 'cmm',
      collector_number: '1',
      primary_category: 'Ramp',
      categories: ['Ramp'],
    });
  });

  it('round-trips foil and multi-category lines', () => {
    const line = ArchidektExport.formatImportLine(2, 'Sol Ring', 'cmm', '1', 'Ramp', null, 'foil');
    const card = ArchidektExport.parseImportLine(line);
    expect(card!.finish).toBe('foil');
    expect(card!.quantity).toBe(2);

    const landLine = ArchidektExport.formatImportLine(
      1,
      'Forest',
      'xyz',
      '1',
      ['Land', 'Proxies'],
      { Proxies: { includedInPrice: false } },
      null,
    );
    const land = ArchidektExport.parseImportLine(landLine);
    expect(land!.categories).toEqual(['Land', 'Proxies']);
  });

  it('skips blank lines and comments', () => {
    const cards = ArchidektExport.parseImportText('# header\n\n1x Sol Ring (cmm) 1 [Ramp]\n');
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe('Sol Ring');
  });
});

describe('ArchidektExport.formatImportLine', () => {
  it('formats quantity, name, set, and collector number', () => {
    expect(ArchidektExport.formatImportLine(1, 'Sol Ring', 'cmm', '1', 'Ramp', null, null)).toBe(
      '1x Sol Ring (cmm) 1 [Ramp]',
    );
  });

  it('appends the foil token before the category bracket', () => {
    expect(ArchidektExport.formatImportLine(1, 'Sol Ring', 'cmm', '1', 'Ramp', null, 'foil')).toBe(
      '1x Sol Ring (cmm) 1 *F* [Ramp]',
    );
  });

  it('appends the etched token before the category bracket', () => {
    expect(ArchidektExport.formatImportLine(2, 'Sol Ring', 'cmm', '1', 'Ramp', null, 'etched')).toBe(
      '2x Sol Ring (cmm) 1 *E* [Ramp]',
    );
  });

  it('omits the printing when there is no set code', () => {
    expect(ArchidektExport.formatImportLine(1, 'Sol Ring', null, null, 'Ramp', null, null)).toBe('1x Sol Ring [Ramp]');
  });

  it('emits set only when collector number is missing', () => {
    expect(ArchidektExport.formatImportLine(1, 'Sol Ring', 'cmm', null, 'Ramp', null, null)).toBe(
      '1x Sol Ring (cmm) [Ramp]',
    );
  });

  it('emits the full category list for basic lands', () => {
    expect(
      ArchidektExport.formatImportLine(
        1,
        'Forest',
        'xyz',
        '1',
        ['Land', 'Proxies'],
        { Proxies: { includedInPrice: false } },
        null,
      ),
    ).toBe('1x Forest (xyz) 1 [Land,Proxies{noPrice}]');
  });
});

describe('ArchidektExport.formatFinishToken', () => {
  it('maps finishes to Archidekt tokens', () => {
    expect(ArchidektExport.formatFinishToken('foil')).toBe(' *F*');
    expect(ArchidektExport.formatFinishToken('etched')).toBe(' *E*');
    expect(ArchidektExport.formatFinishToken('nonfoil')).toBe('');
    expect(ArchidektExport.formatFinishToken(null)).toBe('');
  });
});

describe('ArchidektExport.formatCategoryBracket', () => {
  it('returns empty for no category', () => {
    expect(ArchidektExport.formatCategoryBracket('', 'Sol Ring', null)).toBe('');
  });

  it('marks the New Set In category noDeck/noPrice', () => {
    expect(ArchidektExport.formatCategoryBracket('New Set In', 'Sol Ring', null)).toBe(
      ' [New Set In{noDeck}{noPrice}]',
    );
  });

  it('honors category settings flags', () => {
    const settings = { Ramp: { includedInDeck: false, includedInPrice: false } };
    expect(ArchidektExport.formatCategoryBracket('Ramp', 'Sol Ring', settings)).toBe(
      ' [Ramp{noDeck}{noPrice}]',
    );
  });
});

describe('ArchidektExport.formatCategoriesBracket', () => {
  it('joins multiple categories with per-category flags', () => {
    const settings = { Proxies: { includedInPrice: false, includedInDeck: true } };
    expect(ArchidektExport.formatCategoriesBracket(['Land', 'Proxies'], 'Plateau', settings)).toBe(
      ' [Land,Proxies{noPrice}]',
    );
  });

  it('formats Boros + Proxies like the cube import syntax', () => {
    const settings = { Proxies: { includedInPrice: false, includedInDeck: true } };
    expect(ArchidektExport.formatCategoriesBracket(['Boros', 'Proxies'], 'Ajani', settings)).toBe(
      ' [Boros,Proxies{noPrice}]',
    );
  });
});

describe('ArchidektExport.appendCategory', () => {
  it('appends a category without duplicating it', () => {
    expect(ArchidektExport.appendCategory(['Boros'], 'Proxies')).toEqual(['Boros', 'Proxies']);
    expect(ArchidektExport.appendCategory(['Boros', 'Proxies'], 'Proxies')).toEqual(['Boros', 'Proxies']);
  });
});

describe('ArchidektExport.deckReviewComplete', () => {
  it('treats an empty list as complete', () => {
    expect(ArchidektExport.deckReviewComplete([], () => null)).toEqual({
      complete: true,
      reviewed: 0,
      total: 0,
    });
  });

  it('reports incomplete when any suggestion lacks a decision', () => {
    const suggestions = [{ suggestion_id: 'a' }, { suggestion_id: 'b' }];
    const decisions: Record<string, { status: string }> = { a: { status: 'accepted' } };
    expect(ArchidektExport.deckReviewComplete(suggestions, (id) => decisions[id as string])).toEqual({
      complete: false,
      reviewed: 1,
      total: 2,
    });
  });

  it('reports complete when every suggestion has a decision', () => {
    const suggestions = [{ suggestion_id: 'a' }, { suggestion_id: 'b' }];
    const decisions: Record<string, { status: string }> = {
      a: { status: 'accepted' },
      b: { status: 'skipped' },
    };
    expect(ArchidektExport.deckReviewComplete(suggestions, (id) => decisions[id as string])).toEqual({
      complete: true,
      reviewed: 2,
      total: 2,
    });
  });
});

describe('ArchidektExport.buildFullDeckImport', () => {
  const deck = {
    deck_id: 'd1',
    archidekt_url: 'https://archidekt.com/decks/123/foo',
    deck_snapshot: {
      cards: [
        {
          name: 'Llanowar Elves',
          set_code: 'm19',
          collector_number: '314',
          quantity: 1,
          primary_category: 'Ramp',
        },
        { name: 'Old Card', set_code: 'xyz', collector_number: '1', quantity: 1, primary_category: 'Ramp' },
      ],
    },
  };
  const accepted = [
    {
      suggestion_id: 's1',
      action: 'replace',
      quantity: 1,
      swap_categories: true,
      card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'foil' },
      card_out: { name: 'Old Card', set_code: 'xyz', collector_number: '1', quantity: 1 },
    },
  ];

  it('keeps the unchanged main-deck card', () => {
    const text = ArchidektExport.buildFullDeckImport(deck, accepted);
    expect(text).toContain('1x Llanowar Elves (m19) 314 [Ramp]');
  });

  it('emits the swapped-in card with foil token in the New Set In category', () => {
    const text = ArchidektExport.buildFullDeckImport(deck, accepted);
    expect(text).toContain('1x Sol Ring (cmm) 1 *F* [New Set In{noDeck}{noPrice}]');
  });

  it('emits the swapped-out card in the New Set Out category', () => {
    const text = ArchidektExport.buildFullDeckImport(deck, accepted);
    expect(text).toContain('1x Old Card (xyz) 1 [New Set Out]');
  });

  it('returns empty string for a deck without a snapshot', () => {
    expect(ArchidektExport.buildFullDeckImport({ deck_id: 'x' }, accepted)).toBe('');
  });

  it('preserves dual categories from the snapshot on unchanged cards', () => {
    const proxyDeck = {
      deck_id: 'cube',
      archidekt_url: 'https://archidekt.com/decks/999/cube',
      deck_snapshot: {
        category_settings: { Proxies: { includedInPrice: false, includedInDeck: true } },
        cards: [
          {
            name: 'Plateau',
            set_code: 'vma',
            collector_number: '308',
            quantity: 1,
            primary_category: 'Land',
            categories: ['Land', 'Proxies'],
          },
        ],
      },
    };
    const text = ArchidektExport.buildFullDeckImport(proxyDeck, []);
    expect(text).toContain('1x Plateau (vma) 308 [Land,Proxies{noPrice}]');
  });
});

describe('ArchidektExport.parseDeckId', () => {
  it('extracts the numeric deck id from an Archidekt url', () => {
    expect(ArchidektExport.parseDeckId('https://archidekt.com/decks/123456/my-deck')).toBe(123456);
  });

  it('returns null when there is no deck id', () => {
    expect(ArchidektExport.parseDeckId('https://example.com')).toBe(null);
  });
});
