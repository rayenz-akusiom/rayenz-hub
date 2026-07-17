import { describe, expect, it } from 'vitest';
import { OrderReconcileExport } from '../../../packages/web/src/mtg/order-reconcile-export.ts';

describe('OrderReconcileExport.isCubeDeck', () => {
  it('detects cube decks by name', () => {
    expect(OrderReconcileExport.isCubeDeck({ deck_name: 'My Vintage Cube' })).toBe(true);
    expect(OrderReconcileExport.isCubeDeck({ deck_name: 'Atraxa Superfriends' })).toBe(false);
  });

  it('returns false for null or missing deck name', () => {
    expect(OrderReconcileExport.isCubeDeck(null)).toBe(false);
    expect(OrderReconcileExport.isCubeDeck({})).toBe(false);
  });
});

describe('OrderReconcileExport.namesMatch', () => {
  it('matches identical names case-insensitively', () => {
    expect(OrderReconcileExport.namesMatch('Sol Ring', 'sol ring')).toBe(true);
  });

  it('matches a double-faced card against a single face', () => {
    expect(OrderReconcileExport.namesMatch('Fire // Ice', 'Fire')).toBe(true);
    expect(OrderReconcileExport.namesMatch('Fire', 'Fire // Ice')).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(OrderReconcileExport.namesMatch('Sol Ring', 'Mana Crypt')).toBe(false);
  });
});

describe('OrderReconcileExport.cubeColorCategory', () => {
  it('maps mono and guild color identities', () => {
    expect(OrderReconcileExport.cubeColorCategory([])).toBe('Colorless');
    expect(OrderReconcileExport.cubeColorCategory(['G'])).toBe('Green');
    expect(OrderReconcileExport.cubeColorCategory(['W', 'U'])).toBe('Azorius');
    expect(OrderReconcileExport.cubeColorCategory(['U', 'W'])).toBe('Azorius');
  });

  it('maps full color names and ignores unknown letters', () => {
    expect(OrderReconcileExport.cubeColorCategory(['white'])).toBe('White');
    expect(OrderReconcileExport.cubeColorCategory(['blue'])).toBe('Blue');
    expect(OrderReconcileExport.cubeColorCategory(['black'])).toBe('Black');
    expect(OrderReconcileExport.cubeColorCategory(['red'])).toBe('Red');
    expect(OrderReconcileExport.cubeColorCategory(['green'])).toBe('Green');
    expect(OrderReconcileExport.cubeColorCategory(['x', 'W'])).toBe('White');
  });

  it('returns null for three-or-more-color identities', () => {
    expect(OrderReconcileExport.cubeColorCategory(['W', 'U', 'B'])).toBe(null);
  });

  it('returns null for two-color pairs that do not match sorted guild codes', () => {
    expect(OrderReconcileExport.cubeColorCategory(['U', 'B'])).toBe(null);
  });

  it('maps guild pairs whose sorted codes are in the lookup table', () => {
    expect(OrderReconcileExport.cubeColorCategory(['B', 'R'])).toBe('Rakdos');
    expect(OrderReconcileExport.cubeColorCategory(['B', 'G'])).toBe('Golgari');
    expect(OrderReconcileExport.cubeColorCategory(['R', 'W'])).toBe('Boros');
    expect(OrderReconcileExport.cubeColorCategory(['G', 'W'])).toBe('Selesnya');
  });
});

describe('OrderReconcileExport.resolveCubeDestinationCategory', () => {
  const snapshot = {
    cards: [
      { name: 'Azorius Card', primary_category: 'Azorius' },
      { name: 'Some Ramp', primary_category: 'Ramp' },
    ],
  };

  it('returns the color category when present in the deck', () => {
    expect(OrderReconcileExport.resolveCubeDestinationCategory(snapshot, ['W', 'U'])).toBe('Azorius');
  });

  it('returns empty when the deck has no matching color category', () => {
    expect(OrderReconcileExport.resolveCubeDestinationCategory(snapshot, ['G'])).toBe('');
  });

  it('returns empty when color identity does not map to a guild', () => {
    expect(OrderReconcileExport.resolveCubeDestinationCategory(snapshot, ['W', 'U', 'B'])).toBe('');
  });
});

describe('OrderReconcileExport.deriveSwapQueue / pairSwapSlots', () => {
  const snapshot = {
    cards: [
      {
        name: 'Queue In',
        primary_category: 'New Set In',
        quantity: 1,
        set_code: 'qin',
        collector_number: '1',
      },
      {
        name: 'Queue Out',
        primary_category: 'New Set Out',
        quantity: 1,
        set_code: 'qout',
        collector_number: '1',
      },
      { name: 'Sol Ring', primary_category: 'Ramp', quantity: 1, set_code: 'cmm', collector_number: '1' },
    ],
  };

  it('splits the snapshot into in/out queues', () => {
    const queue = OrderReconcileExport.deriveSwapQueue(snapshot);
    expect(queue.new_set_in.map((c) => c.name)).toEqual(['Queue In']);
    expect(queue.new_set_out.map((c) => c.name)).toEqual(['Queue Out']);
  });

  it('pairs in/out slots by index', () => {
    const queue = OrderReconcileExport.deriveSwapQueue(snapshot);
    const pairs = OrderReconcileExport.pairSwapSlots(queue.new_set_in, queue.new_set_out);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].in.name).toBe('Queue In');
    expect(pairs[0].out!.name).toBe('Queue Out');
    expect(pairs[0].index).toBe(0);
  });

  it('returns empty queues when snapshot is null or missing cards', () => {
    expect(OrderReconcileExport.deriveSwapQueue(null)).toEqual({
      new_set_in: [],
      new_set_out: [],
      metadata_flags: [],
    });
    expect(OrderReconcileExport.deriveSwapQueue({})).toEqual({
      new_set_in: [],
      new_set_out: [],
      metadata_flags: [],
    });
  });
});

describe('OrderReconcileExport.deriveMaybeboard', () => {
  it('returns only Maybeboard cards', () => {
    const snapshot = {
      cards: [
        { name: 'MB One', primary_category: 'Maybeboard' },
        { name: 'Main One', primary_category: 'Ramp' },
      ],
    };
    expect(OrderReconcileExport.deriveMaybeboard(snapshot).map((c) => c.name)).toEqual(['MB One']);
  });

  it('returns empty for null snapshot or missing cards array', () => {
    expect(OrderReconcileExport.deriveMaybeboard(null)).toEqual([]);
    expect(OrderReconcileExport.deriveMaybeboard({})).toEqual([]);
  });
});

describe('OrderReconcileExport.slot keys and cardFaces', () => {
  it('builds maybeboard and fulfilled slot keys', () => {
    expect(OrderReconcileExport.maybeboardSlotKey('d1', 2, 'Sol Ring')).toBe('d1:mb:2:Sol Ring');
    expect(OrderReconcileExport.fulfilledSlotKey('d1', 0, 'Queue In')).toBe('d1:0:Queue In');
  });

  it('splits double-faced names into faces', () => {
    expect(OrderReconcileExport.cardFaces('Fire // Ice')).toEqual(['fire', 'ice']);
    expect(OrderReconcileExport.cardFaces('')).toEqual([]);
  });
});

describe('OrderReconcileExport.deckCategories', () => {
  it('lists sorted main-deck categories excluding swap staging categories', () => {
    const snapshot = {
      cards: [
        { primary_category: 'New Set In' },
        { primary_category: 'New Set Out' },
        { primary_category: 'Ramp' },
        { primary_category: 'Land' },
      ],
    };
    expect(OrderReconcileExport.deckCategories(snapshot)).toEqual(['Land', 'Ramp']);
  });
});

describe('OrderReconcileExport.deckReconcileComplete', () => {
  it('treats an empty list as complete', () => {
    expect(OrderReconcileExport.deckReconcileComplete([], () => null)).toEqual({
      complete: true,
      reviewed: 0,
      total: 0,
    });
  });

  it('reports incomplete when an item lacks a decision', () => {
    const items = [{ item_id: 'a' }, { item_id: 'b' }];
    const decisions: Record<string, { status: string }> = { a: { status: 'accepted' } };
    expect(OrderReconcileExport.deckReconcileComplete(items, (id) => decisions[id as string])).toEqual({
      complete: false,
      reviewed: 1,
      total: 2,
    });
  });
});

describe('OrderReconcileExport.buildReconcileDeckImport', () => {
  const snapshot = {
    cards: [
      { name: 'Keeper', set_code: 'aaa', collector_number: '1', quantity: 1, primary_category: 'Ramp' },
      { name: 'Cut Me', set_code: 'bbb', collector_number: '2', quantity: 1, primary_category: 'Ramp' },
      {
        name: 'Queue In',
        primary_category: 'New Set In',
        quantity: 1,
        set_code: 'qin',
        collector_number: '1',
      },
      {
        name: 'Queue Out',
        primary_category: 'New Set Out',
        quantity: 1,
        set_code: 'qout',
        collector_number: '1',
      },
    ],
  };
  const acceptedItems = [
    {
      status: 'accepted',
      slot_key: 'manual-slot',
      accepted: {
        card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'foil' },
        destination_category: 'Ramp',
        quantity: 1,
        card_out: { name: 'Cut Me', set_code: 'bbb', collector_number: '2' },
      },
    },
  ];

  it('keeps unchanged cards and adds the accepted card with its finish', () => {
    const text = OrderReconcileExport.buildReconcileDeckImport('d1', snapshot, acceptedItems, acceptedItems);
    expect(text).toContain('1x Keeper (aaa) 1 [Ramp]');
    expect(text).toContain('1x Sol Ring (cmm) 1 *F* [Ramp]');
  });

  it('removes the cut card from the deck', () => {
    const text = OrderReconcileExport.buildReconcileDeckImport('d1', snapshot, acceptedItems, acceptedItems);
    expect(text).not.toContain('Cut Me');
  });

  it('still emits the unfulfilled swap queue in/out lines', () => {
    const text = OrderReconcileExport.buildReconcileDeckImport('d1', snapshot, acceptedItems, acceptedItems);
    expect(text).toContain('1x Queue In (qin) 1 [New Set In{noDeck}{noPrice}]');
    expect(text).toContain('1x Queue Out (qout) 1 [New Set Out]');
  });

  it('removes an accepted card from the maybeboard', () => {
    const mbSnapshot = {
      cards: [
        {
          name: 'MB Card',
          set_code: 'mb',
          collector_number: '1',
          quantity: 1,
          primary_category: 'Maybeboard',
        },
        { name: 'Keeper', set_code: 'aaa', collector_number: '1', quantity: 1, primary_category: 'Ramp' },
      ],
    };
    const mbAccepted = [
      {
        status: 'accepted',
        slot_key: 'mb-slot',
        accepted: {
          card_in: { name: 'MB Card', set_code: 'mb', collector_number: '1' },
          destination_category: 'Ramp',
          quantity: 1,
          card_out: null,
        },
      },
    ];
    const text = OrderReconcileExport.buildReconcileDeckImport('d1', mbSnapshot, mbAccepted, mbAccepted);
    expect(text).toContain('1x MB Card (mb) 1 [Ramp]');
    expect(text).not.toContain('Maybeboard');
  });

  it('preserves dual categories from the snapshot on unchanged cards', () => {
    const snapshotWithProxy = {
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
        {
          name: 'Queue In',
          primary_category: 'New Set In',
          quantity: 1,
          set_code: 'qin',
          collector_number: '1',
        },
        {
          name: 'Queue Out',
          primary_category: 'New Set Out',
          quantity: 1,
          set_code: 'qout',
          collector_number: '1',
        },
      ],
    };
    const text = OrderReconcileExport.buildReconcileDeckImport('d1', snapshotWithProxy, [], []);
    expect(text).toContain('1x Plateau (vma) 308 [Land,Proxies{noPrice}]');
  });

  it('appends Proxies to accepted card-in lines when isProxyOrder is set', () => {
    const cubeSnapshot = {
      category_settings: { Proxies: { includedInPrice: false, includedInDeck: true } },
      cards: [{ name: 'Keeper', set_code: 'aaa', collector_number: '1', quantity: 1, primary_category: 'Azorius' }],
    };
    const accepted = [
      {
        status: 'accepted',
        slot_key: 'slot-1',
        accepted: {
          card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1' },
          destination_category: 'Azorius',
          quantity: 1,
          card_out: null,
        },
      },
    ];
    const text = OrderReconcileExport.buildReconcileDeckImport('d1', cubeSnapshot, accepted, accepted, {
      isProxyOrder: true,
    });
    expect(text).toContain('1x Sol Ring (cmm) 1 [Azorius,Proxies{noPrice}]');
  });

  it('does not append Proxies when isProxyOrder is false', () => {
    const text = OrderReconcileExport.buildReconcileDeckImport('d1', snapshot, acceptedItems, acceptedItems, {
      isProxyOrder: false,
    });
    expect(text).toContain('1x Sol Ring (cmm) 1 *F* [Ramp]');
    expect(text).not.toContain('Proxies');
  });

  it('returns empty string when snapshot is null', () => {
    expect(OrderReconcileExport.buildReconcileDeckImport('d1', null, [], [])).toBe('');
  });

  it('skips fulfilled swap-queue slots by slot_key', () => {
    const text = OrderReconcileExport.buildReconcileDeckImport(
      'd1',
      snapshot,
      [
        {
          status: 'accepted',
          slot_key: 'd1:0:Queue In',
          accepted: {
            card_in: { name: 'Queue In', set_code: 'qin', collector_number: '1' },
            destination_category: 'Ramp',
            quantity: 1,
          },
        },
      ],
      [],
    );
    expect(text).not.toContain('[New Set In{noDeck}{noPrice}]');
    expect(text).not.toContain('Queue Out');
  });

  it('deducts cube maybeboard_entry names when is_cube is set', () => {
    const cubeSnapshot = {
      cards: [
        { name: 'MB Target', primary_category: 'Maybeboard', quantity: 1 },
        { name: 'Keeper', primary_category: 'Azorius', quantity: 1, set_code: 'aaa', collector_number: '1' },
      ],
    };
    const accepted = [
      {
        status: 'accepted',
        is_cube: true,
        maybeboard_entry: { name: 'MB Target' },
        accepted: {
          card_in: { name: 'Incoming', set_code: 'cmm', collector_number: '1' },
          destination_category: 'Azorius',
          quantity: 1,
        },
      },
    ];
    const text = OrderReconcileExport.buildReconcileDeckImport('cube-1', cubeSnapshot, accepted, accepted);
    expect(text).toContain('Incoming');
    expect(text).not.toContain('Maybeboard');
  });

  it('ignores non-accepted reconcile items', () => {
    const text = OrderReconcileExport.buildReconcileDeckImport(
      'd1',
      snapshot,
      [{ status: 'skipped', accepted: { card_in: { name: 'Skipped' }, destination_category: 'Ramp' } }],
      [],
    );
    expect(text).not.toContain('Skipped');
  });
});

describe('OrderReconcileExport.buildStagingCleanupImport', () => {
  it('deducts removed quantities from the staging snapshot', () => {
    const snapshot = {
      cards: [
        { name: 'Buy A', set_code: 'aaa', collector_number: '1', quantity: 2, primary_category: 'Maybeboard' },
      ],
    };
    const removals = [{ name: 'Buy A', set_code: 'aaa', collector_number: '1', quantity: 1 }];
    const text = OrderReconcileExport.buildStagingCleanupImport(snapshot, removals);
    expect(text).toContain('1x Buy A (aaa) 1 [Maybeboard{noDeck}{noPrice}]');
  });

  it('returns empty string when snapshot is null', () => {
    expect(OrderReconcileExport.buildStagingCleanupImport(null, [])).toBe('');
  });

  it('skips rows when set codes conflict during deduct', () => {
    const snapshot = {
      cards: [{ name: 'Flex Cut', set_code: 'aaa', collector_number: '1', quantity: 1, primary_category: 'Ramp' }],
    };
    const text = OrderReconcileExport.buildStagingCleanupImport(snapshot, [
      { name: 'Flex Cut', set_code: 'bbb', collector_number: '9', quantity: 1 },
    ]);
    expect(text).toContain('Flex Cut');
  });

  it('deducts by name when the removal lacks printing info', () => {
    const snapshot = {
      cards: [{ name: 'Flex Cut', set_code: 'aaa', collector_number: '1', quantity: 1, primary_category: 'Ramp' }],
    };
    const text = OrderReconcileExport.buildStagingCleanupImport(snapshot, [{ name: 'Flex Cut', quantity: 1 }]);
    expect(text).not.toContain('Flex Cut');
  });
});

describe('OrderReconcileExport.summarizeDeck', () => {
  const queueSnapshot = {
    cards: [
      { name: 'Queue In', primary_category: 'New Set In', quantity: 1 },
      { name: 'Queue Out', primary_category: 'New Set Out', quantity: 1 },
      { name: 'Keeper', primary_category: 'Ramp', quantity: 1 },
    ],
  };

  it('returns empty summary when snapshot is null', () => {
    expect(OrderReconcileExport.summarizeDeck('d1', null, [])).toEqual({
      ins: [],
      outs: [],
      remainingIn: [],
      remainingOut: [],
    });
  });

  it('collects accepted ins/outs and remaining queue slots', () => {
    const accepted = [
      {
        status: 'accepted',
        slot_key: 'manual',
        accepted: {
          card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1' },
          destination_category: 'Ramp',
          card_out: { name: 'Cut', set_code: 'bbb', collector_number: '2' },
        },
      },
    ];
    const summary = OrderReconcileExport.summarizeDeck('d1', queueSnapshot, accepted);
    expect(summary.ins.map((c) => c.name)).toEqual(['Sol Ring']);
    expect(summary.outs.map((c) => c.name)).toEqual(['Cut']);
    expect(summary.remainingIn.map((c) => c.name)).toEqual(['Queue In']);
    expect(summary.remainingOut.map((c) => c.name)).toEqual(['Queue Out']);
  });

  it('skips fulfilled queue slots in remaining lists', () => {
    const summary = OrderReconcileExport.summarizeDeck('d1', queueSnapshot, [
      {
        status: 'accepted',
        slot_key: 'd1:0:Queue In',
        accepted: {
          card_in: { name: 'Queue In' },
          destination_category: 'Ramp',
        },
      },
    ]);
    expect(summary.remainingIn).toEqual([]);
    expect(summary.remainingOut).toEqual([]);
  });

  it('uses maybeboard remaining cards for cube decks', () => {
    const cubeSnapshot = {
      cards: [
        { name: 'MB One', primary_category: 'Maybeboard' },
        { name: 'MB Two', primary_category: 'Maybeboard' },
      ],
    };
    const summary = OrderReconcileExport.summarizeDeck('cube-1', cubeSnapshot, [], { isCube: true });
    expect(summary.remainingIn.map((c) => c.name)).toEqual(['MB One', 'MB Two']);
    expect(summary.remainingOut).toEqual([]);
  });

  it('skips fulfilled maybeboard slots for cube decks', () => {
    const cubeSnapshot = {
      cards: [{ name: 'MB One', primary_category: 'Maybeboard' }],
    };
    const summary = OrderReconcileExport.summarizeDeck(
      'cube-1',
      cubeSnapshot,
      [{ status: 'accepted', slot_key: 'cube-1:mb:0:MB One', accepted: { card_in: { name: 'MB One' } } }],
      { isCube: true },
    );
    expect(summary.remainingIn).toEqual([]);
  });

  it('ignores non-accepted items', () => {
    const summary = OrderReconcileExport.summarizeDeck('d1', queueSnapshot, [
      { status: 'skipped', accepted: { card_in: { name: 'Nope' } } },
    ]);
    expect(summary.ins).toEqual([]);
  });
});

describe('OrderReconcileExport.pairSwapSlots edge cases', () => {
  it('pairs in cards with null out when out queue is shorter', () => {
    const pairs = OrderReconcileExport.pairSwapSlots([{ name: 'In Only' }], []);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].out).toBe(null);
  });
});
