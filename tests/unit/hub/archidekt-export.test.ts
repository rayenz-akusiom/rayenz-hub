import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArchidektExport } from '../../../packages/web/src/mtg/archidekt-export.ts';

afterEach(() => {
  delete (window as Window & { RayenzArchidektBridge?: unknown }).RayenzArchidektBridge;
  vi.restoreAllMocks();
});

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

  it('marks the Queued In category noDeck/noPrice', () => {
    expect(ArchidektExport.formatCategoryBracket('Queued In', 'Sol Ring', null)).toBe(
      ' [Queued In{noDeck}{noPrice}]',
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

  it('emits the swapped-in card with foil token in the Queued In category', () => {
    const text = ArchidektExport.buildFullDeckImport(deck, accepted);
    expect(text).toContain('1x Sol Ring (cmm) 1 *F* [Queued In{noDeck}{noPrice}]');
  });

  it('emits the swapped-out card in the Queued Out category', () => {
    const text = ArchidektExport.buildFullDeckImport(deck, accepted);
    expect(text).toContain('1x Old Card (xyz) 1 [Queued Out]');
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
    expect(ArchidektExport.parseDeckId(null)).toBe(null);
  });
});

describe('ArchidektExport.parseImportLine errors', () => {
  it('throws on an invalid import line', () => {
    expect(() => ArchidektExport.parseImportLine('not a card line')).toThrow(/Invalid import line/);
  });

  it('parses set-only printing without collector number', () => {
    const card = ArchidektExport.parseImportLine('1x Sol Ring (cmm) [Ramp]');
    expect(card).toMatchObject({ name: 'Sol Ring', set_code: 'cmm', collector_number: '' });
  });

  it('strips category flags when parsing brackets', () => {
    const card = ArchidektExport.parseImportLine('1x Forest [Land,Proxies{noPrice}{noDeck}]');
    expect(card!.categories).toEqual(['Land', 'Proxies']);
  });
});

describe('ArchidektExport.parseImportText errors', () => {
  it('throws when no valid lines remain', () => {
    expect(() => ArchidektExport.parseImportText('# only comments\n\n')).toThrow(/Paste at least one/);
  });
});

describe('ArchidektExport.buildCategorySettings', () => {
  it('skips categories without names', () => {
    expect(
      ArchidektExport.buildCategorySettings({
        categories: [null as unknown as { name?: string }, {}, { name: 'Ramp' }],
      }),
    ).toEqual({ Ramp: { includedInDeck: true, includedInPrice: true } });
  });

  it('respects includedInDeck and includedInPrice false', () => {
    expect(
      ArchidektExport.buildCategorySettings({
        categories: [{ name: 'Proxies', includedInDeck: false, includedInPrice: false }],
      }),
    ).toEqual({ Proxies: { includedInDeck: false, includedInPrice: false } });
  });
});

describe('ArchidektExport.normalizeCategories', () => {
  it('uses primaryFallback when the list is empty', () => {
    expect(ArchidektExport.normalizeCategories([], 'Ramp')).toEqual(['Ramp']);
  });

  it('dedupes entries and skips falsy categories', () => {
    expect(ArchidektExport.normalizeCategories(['Ramp', '', 'Ramp', 'Land'], null)).toEqual(['Ramp', 'Land']);
  });
});

describe('ArchidektExport.formatCategoryBracket defaults', () => {
  it('marks borrowed (out) as noDeck/noPrice', () => {
    expect(ArchidektExport.formatCategoryBracket('borrowed (out)', 'Card', null)).toBe(
      ' [borrowed (out){noDeck}{noPrice}]',
    );
  });

  it('marks Maybeboard as noDeck/noPrice', () => {
    expect(ArchidektExport.formatCategoryBracket('Maybeboard', 'Card', null)).toBe(
      ' [Maybeboard{noDeck}{noPrice}]',
    );
  });

  it('matches category settings case-insensitively', () => {
    const settings = { ramp: { includedInDeck: false, includedInPrice: true } };
    expect(ArchidektExport.formatCategoryBracket('Ramp', 'Card', settings)).toBe(' [Ramp{noDeck}]');
  });

  it('applies only includedInPrice false when deck is included', () => {
    const settings = { Ramp: { includedInPrice: false, includedInDeck: true } };
    expect(ArchidektExport.formatCategoryBracket('Ramp', 'Card', settings)).toBe(' [Ramp{noPrice}]');
  });
});

describe('ArchidektExport.formatCategoriesBracket empty', () => {
  it('returns empty when there are no categories', () => {
    expect(ArchidektExport.formatCategoriesBracket([], 'Card', null)).toBe('');
  });
});

describe('ArchidektExport.cardKey', () => {
  it('joins name, set code, and collector number', () => {
    expect(ArchidektExport.cardKey('Sol Ring', 'CMM', '1')).toBe('Sol Ring|cmm|1');
    expect(ArchidektExport.cardKey('Sol Ring', null, null)).toBe('Sol Ring||');
  });
});

describe('ArchidektExport.buildMainDeckPool', () => {
  it('excludes Queued In/Out and unnamed cards', () => {
    const pool = ArchidektExport.buildMainDeckPool({
      cards: [
        { name: 'In', primary_category: 'Queued In' },
        { name: 'Out', primary_category: 'Queued Out' },
        { primary_category: 'Ramp' },
        { name: 'Keeper', primary_category: 'Ramp', quantity: 2 },
      ],
    });
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ name: 'Keeper', quantity: 2 });
  });

  it('clones categories from the categories array when present', () => {
    const pool = ArchidektExport.buildMainDeckPool({
      cards: [{ name: 'Plateau', categories: ['Land', 'Proxies'], quantity: 1 }],
    });
    expect(pool[0].categories).toEqual(['Land', 'Proxies']);
  });
});

describe('ArchidektExport.addToLineMap', () => {
  it('ignores zero or negative quantity', () => {
    const map: Record<string, unknown> = {};
    ArchidektExport.addToLineMap(map, { name: 'X' }, ['Ramp'], 0);
    ArchidektExport.addToLineMap(map, { name: 'Y' }, ['Ramp'], -1);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('merges duplicate keys by summing quantity', () => {
    const map: Record<string, { quantity: number }> = {};
    ArchidektExport.addToLineMap(map, { name: 'Sol Ring', set_code: 'cmm', collector_number: '1' }, ['Ramp'], 1);
    ArchidektExport.addToLineMap(map, { name: 'Sol Ring', set_code: 'cmm', collector_number: '1' }, ['Ramp'], 2);
    expect(Object.values(map)[0].quantity).toBe(3);
  });
});

describe('ArchidektExport.lineMapToImportLines', () => {
  it('skips rows with zero quantity', () => {
    const map = {
      k: {
        name: 'Ghost',
        set_code: null,
        collector_number: null,
        categories: ['Ramp'],
        finish: null,
        quantity: 0,
      },
    };
    expect(ArchidektExport.lineMapToImportLines(map, null)).toEqual([]);
  });
});

describe('ArchidektExport.buildTargetAcceptedSwaps', () => {
  it('filters out decisions with swap_categories false', () => {
    const swaps = [
      { swap_categories: true, card_in: { name: 'Keep' } },
      { swap_categories: false, card_in: { name: 'Drop' } },
    ];
    expect(ArchidektExport.buildTargetAcceptedSwaps(swaps)).toHaveLength(1);
    expect(ArchidektExport.buildTargetAcceptedSwaps(swaps)[0].card_in!.name).toBe('Keep');
  });
});

describe('ArchidektExport.buildImportTextForDeck', () => {
  it('builds swap-only import lines for category swaps', () => {
    const accepted = [
      {
        swap_categories: true,
        quantity: 1,
        card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1' },
        card_out: { name: 'Old', set_code: 'xyz', collector_number: '1', quantity: 1 },
      },
    ];
    const text = ArchidektExport.buildImportTextForDeck(accepted, null);
    expect(text).toContain('[Queued In{noDeck}{noPrice}]');
    expect(text).toContain('[Queued Out]');
  });

  it('skips non-category swap decisions', () => {
    const text = ArchidektExport.buildImportTextForDeck(
      [{ swap_categories: false, card_in: { name: 'Ignored' } }],
      null,
    );
    expect(text).toBe('');
  });
});

describe('ArchidektExport.isReviewComplete', () => {
  it('reports incomplete when a decision lacks status', () => {
    expect(
      ArchidektExport.isReviewComplete([{ id: 'a' }], 'id', () => ({ status: undefined })),
    ).toEqual({ complete: false, reviewed: 0, total: 1 });
  });

  it('reports incomplete when getDecisionFn returns null', () => {
    expect(ArchidektExport.isReviewComplete([{ id: 'a' }], 'id', () => null)).toEqual({
      complete: false,
      reviewed: 0,
      total: 1,
    });
  });
});

describe('ArchidektExport.buildDeckApplyEntry', () => {
  it('returns null when import text would be empty', () => {
    expect(ArchidektExport.buildDeckApplyEntry({ deck_id: 'x' }, [])).toBe(null);
  });
});

describe('ArchidektExport.buildApplyManifest', () => {
  it('filters out decks that produce no import text', () => {
    const manifest = ArchidektExport.buildApplyManifest({ set_code: 'MSH' }, [{ deck_id: 'empty' }], {});
    expect(manifest.decks).toEqual([]);
    expect(manifest.set_code).toBe('MSH');
  });
});

describe('ArchidektExport.buildFullDeckImport deduct paths', () => {
  it('deducts by name only when the cut lacks printing info', () => {
    const deck = {
      deck_snapshot: {
        cards: [{ name: 'Old Card', primary_category: 'Ramp', quantity: 1 }],
      },
    };
    const accepted = [
      {
        swap_categories: true,
        card_in: { name: 'New Card' },
        card_out: { name: 'Old Card' },
      },
    ];
    const text = ArchidektExport.buildFullDeckImport(deck, accepted);
    expect(text).not.toMatch(/Old Card \[Ramp\]/);
    expect(text).toContain('Old Card [Queued Out]');
    expect(text).toContain('New Card');
  });

  it('emits unmatched cuts in Queued Out when not in the pool', () => {
    const deck = {
      deck_snapshot: {
        cards: [{ name: 'Keeper', primary_category: 'Ramp', quantity: 1 }],
      },
    };
    const accepted = [
      {
        swap_categories: true,
        card_in: { name: 'Incoming' },
        card_out: { name: 'Ghost', set_code: 'xyz', collector_number: '99' },
      },
    ];
    const text = ArchidektExport.buildFullDeckImport(deck, accepted);
    expect(text).toContain('Ghost');
    expect(text).toContain('[Queued Out]');
  });

  it('skips decisions without swap_categories', () => {
    const deck = {
      deck_snapshot: {
        cards: [{ name: 'Keeper', primary_category: 'Ramp', quantity: 1 }],
      },
    };
    const text = ArchidektExport.buildFullDeckImport(deck, [
      { swap_categories: false, card_in: { name: 'Ignored' } },
    ]);
    expect(text).not.toContain('Ignored');
    expect(text).toContain('Keeper');
  });

  it('returns empty when snapshot cards is not an array', () => {
    expect(ArchidektExport.buildFullDeckImport({ deck_snapshot: { cards: null as unknown as [] } }, [])).toBe('');
  });
});

describe('ArchidektExport bridge helpers', () => {
  it('stageDeckApply throws when deck id or import text is missing', () => {
    expect(() => ArchidektExport.stageDeckApply(0, 'text')).toThrow(/Missing deck id/);
    expect(() => ArchidektExport.stageDeckApply(123, '')).toThrow(/Missing deck id/);
  });

  it('stageDeckApply throws when the bridge is unavailable', () => {
    expect(() => ArchidektExport.stageDeckApply(123, '1x Card')).toThrow(/Bridge userscript/);
  });

  it('stageDeckApply delegates to the bridge when present', () => {
    const stageApply = vi.fn();
    (window as Window & { RayenzArchidektBridge?: { stageApply?: typeof stageApply } }).RayenzArchidektBridge = {
      stageApply,
    };
    ArchidektExport.stageDeckApply(123, '1x Card');
    expect(stageApply).toHaveBeenCalledWith(123, '1x Card');
  });

  it('getStagedDeckApply returns null without a bridge', () => {
    expect(ArchidektExport.getStagedDeckApply(123)).toBe(null);
  });

  it('getStagedDeckApply delegates to the bridge when present', () => {
    (window as Window & { RayenzArchidektBridge?: { getStagedApply?: () => string } }).RayenzArchidektBridge = {
      getStagedApply: () => 'staged',
    };
    expect(ArchidektExport.getStagedDeckApply(123)).toBe('staged');
  });

  it('clearStagedDeckApply no-ops without a bridge', () => {
    expect(() => ArchidektExport.clearStagedDeckApply(123)).not.toThrow();
  });

  it('clearStagedDeckApply delegates to the bridge when present', () => {
    const clearStagedApply = vi.fn();
    (window as Window & { RayenzArchidektBridge?: { clearStagedApply?: typeof clearStagedApply } }).RayenzArchidektBridge =
      { clearStagedApply };
    ArchidektExport.clearStagedDeckApply(123);
    expect(clearStagedApply).toHaveBeenCalledWith(123);
  });
});

describe('ArchidektExport.copyText', () => {
  it('uses navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await ArchidektExport.copyText('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal('document', {
      ...document,
      execCommand,
      createElement: document.createElement.bind(document),
      body: document.body,
    });
    await ArchidektExport.copyText('fallback');
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
