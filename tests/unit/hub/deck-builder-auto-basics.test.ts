import { describe, expect, it } from 'vitest';
import {
  calculateAutoBasicsBreakdown,
  DEFAULT_LAND_TARGET,
  emptyCardOracle,
  listBasicLandStacks,
  oracleKey,
  parseManaCostPips,
  recalculateAutoBasics,
  shouldRecalculateAutoBasics,
  type CardInstance,
  type DeckDocument,
} from '../../../packages/shared/src/index.ts';

function card(
  over: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'name'>,
): CardInstance {
  return {
    quantity: 1,
    primaryCategory: 'Other',
    categories: ['Other'],
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
    ...over,
  };
}

function deck(over: Partial<DeckDocument> = {}): DeckDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    deckId: 'd1',
    name: 'Test',
    format: 'commander',
    ownership: 'owned',
    visibility: 'public',
    archidektId: null,
    archidektUrl: null,
    categories: [
      { name: 'Commander', includedInDeck: true, includedInPrice: true, target: 1 },
      { name: 'Land', includedInDeck: true, includedInPrice: true, target: 36 },
      { name: 'Other', includedInDeck: true, includedInPrice: true, target: null },
    ],
    cards: [],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: 'category',
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: now,
    updatedAt: now,
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
    autoAdjustBasics: true,
    description: '',
    ...over,
  };
}

function withOracle(
  d: DeckDocument,
  instances: CardInstance[],
  oracleById: Record<string, Parameters<typeof emptyCardOracle>[0]>,
): DeckDocument {
  const oracle = { ...(d.oracle || {}) };
  for (const c of instances) {
    const partial = oracleById[c.instanceId] || {};
    oracle[oracleKey(c)] = emptyCardOracle(partial);
  }
  return { ...d, cards: instances, oracle };
}

describe('parseManaCostPips', () => {
  it('counts coloured pips and ignores generic', () => {
    expect(parseManaCostPips('{2}{W}{U}')).toEqual({
      W: 1,
      U: 1,
      B: 0,
      R: 0,
      G: 0,
    });
  });

  it('splits hybrid and counts Phyrexian as a full pip', () => {
    expect(parseManaCostPips('{W/U}')).toEqual({
      W: 0.5,
      U: 0.5,
      B: 0,
      R: 0,
      G: 0,
    });
    expect(parseManaCostPips('{W/P}')).toEqual({
      W: 1,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
    });
  });
});

describe('recalculateAutoBasics', () => {
  it('no-ops when auto is off unless forced', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Atraxa',
      primaryCategory: 'Commander',
      categories: ['Commander'],
      scryfallId: 'sf-cmd',
    });
    const base = withOracle(deck({ autoAdjustBasics: false }), [cmd], {
      cmd: {
        colourIdentity: ['W', 'U', 'B', 'G'],
        typeLine: 'Legendary Creature',
        manaCost: '{G}{W}{U}{B}',
        producedMana: [],
        manaValue: 4,
        scryfallId: 'sf-cmd',
      },
    });
    expect(recalculateAutoBasics(base)).toBe(base);
    const forced = recalculateAutoBasics(base, { force: true });
    const basics = listBasicLandStacks(forced);
    expect(basics.reduce((s, c) => s + c.quantity, 0)).toBe(DEFAULT_LAND_TARGET);
  });

  it('no-ops when commander CI is unknown', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Mystery',
      primaryCategory: 'Commander',
      categories: ['Commander'],
    });
    const base = withOracle(deck(), [cmd], {
      cmd: { colourIdentity: [], typeLine: null, manaCost: null, producedMana: null },
    });
    expect(recalculateAutoBasics(base)).toBe(base);
  });

  it('fills Wastes for colourless commanders', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Kozilek',
      primaryCategory: 'Commander',
      categories: ['Commander'],
      scryfallId: 'sf-koz',
    });
    const base = withOracle(deck({ categories: [
      { name: 'Commander', includedInDeck: true, includedInPrice: true, target: 1 },
      { name: 'Land', includedInDeck: true, includedInPrice: true, target: 10 },
      { name: 'Other', includedInDeck: true, includedInPrice: true, target: null },
    ] }), [cmd], {
      cmd: {
        colourIdentity: [],
        typeLine: 'Legendary Creature — Eldrazi',
        manaCost: '{10}',
        producedMana: [],
        manaValue: 10,
        scryfallId: 'sf-koz',
      },
    });
    const next = recalculateAutoBasics(base);
    const basics = listBasicLandStacks(next);
    expect(basics).toHaveLength(1);
    expect(basics[0]!.name).toBe('Wastes');
    expect(basics[0]!.quantity).toBe(10);
  });

  it('sets basics to zero when nonbasics already meet target', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Kenrith',
      primaryCategory: 'Commander',
      categories: ['Commander'],
      scryfallId: 'sf-cmd',
    });
    const land = card({
      instanceId: 'l1',
      name: 'Command Tower',
      primaryCategory: 'Land',
      categories: ['Land'],
      scryfallId: 'sf-tower',
    });
    const forest = card({
      instanceId: 'f1',
      name: 'Forest',
      quantity: 5,
      primaryCategory: 'Land',
      categories: ['Land'],
    });
    const base = withOracle(
      deck({
        categories: [
          { name: 'Commander', includedInDeck: true, includedInPrice: true, target: 1 },
          { name: 'Land', includedInDeck: true, includedInPrice: true, target: 1 },
        ],
      }),
      [cmd, land, forest],
      {
        cmd: {
          colourIdentity: ['G'],
          typeLine: 'Legendary Creature',
          manaCost: '{G}',
          producedMana: [],
          manaValue: 1,
          scryfallId: 'sf-cmd',
        },
        l1: {
          colourIdentity: ['W', 'U', 'B', 'R', 'G'],
          typeLine: 'Land',
          manaCost: '',
          producedMana: ['W', 'U', 'B', 'R', 'G'],
          manaValue: 0,
          scryfallId: 'sf-tower',
        },
      },
    );
    const next = recalculateAutoBasics(base);
    expect(listBasicLandStacks(next)).toHaveLength(0);
  });

  it('skews basics toward pip demand given dual land supply', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'TwoColor',
      primaryCategory: 'Commander',
      categories: ['Commander'],
      scryfallId: 'sf-cmd',
    });
    const dual = card({
      instanceId: 'dual',
      name: 'Breeding Pool',
      primaryCategory: 'Land',
      categories: ['Land'],
      scryfallId: 'sf-dual',
    });
    // Heavy blue pips, light green
    const spell = card({
      instanceId: 'sp',
      name: 'Counterspell',
      primaryCategory: 'Other',
      categories: ['Other'],
      scryfallId: 'sf-cs',
    });
    const base = withOracle(
      deck({
        categories: [
          { name: 'Commander', includedInDeck: true, includedInPrice: true, target: 1 },
          { name: 'Land', includedInDeck: true, includedInPrice: true, target: 11 },
          { name: 'Other', includedInDeck: true, includedInPrice: true, target: null },
        ],
      }),
      [cmd, dual, spell],
      {
        cmd: {
          colourIdentity: ['U', 'G'],
          typeLine: 'Legendary Creature',
          manaCost: '{U}{G}',
          producedMana: [],
          manaValue: 2,
          scryfallId: 'sf-cmd',
        },
        dual: {
          colourIdentity: ['U', 'G'],
          typeLine: 'Land — Forest Island',
          manaCost: '',
          producedMana: ['U', 'G'],
          manaValue: 0,
          scryfallId: 'sf-dual',
        },
        sp: {
          colourIdentity: ['U'],
          typeLine: 'Instant',
          manaCost: '{U}{U}',
          producedMana: [],
          manaValue: 2,
          scryfallId: 'sf-cs',
        },
      },
    );
    // Demand: U=3 (cmd 1 + spell 2), G=1. Budget = 10 basics.
    // Dual already supplies 1U+1G. Basics should favour Islands.
    const next = recalculateAutoBasics(base);
    const byName = new Map(
      listBasicLandStacks(next).map((c) => [c.name, c.quantity] as const),
    );
    const islands = byName.get('Island') || 0;
    const forests = byName.get('Forest') || 0;
    expect(islands + forests).toBe(10);
    expect(islands).toBeGreaterThan(forests);
  });

  it('adds white basics when a five-colour deck has a triple-white card', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Kenrith',
      primaryCategory: 'Commander',
      categories: ['Commander'],
      scryfallId: 'sf-cmd',
    });
    const triome = card({
      instanceId: 'triome',
      name: 'Savai Triome',
      primaryCategory: 'Land',
      categories: ['Land'],
      scryfallId: 'sf-triome',
    });
    const spell = card({
      instanceId: 'wrath',
      name: 'Wrath of God',
      primaryCategory: 'Other',
      categories: ['Other'],
      scryfallId: 'sf-wrath',
    });
    const base = withOracle(
      deck({
        categories: [
          { name: 'Commander', includedInDeck: true, includedInPrice: true, target: 1 },
          { name: 'Land', includedInDeck: true, includedInPrice: true, target: 6 },
          { name: 'Other', includedInDeck: true, includedInPrice: true, target: null },
        ],
      }),
      [cmd, triome, spell],
      {
        cmd: {
          colourIdentity: ['W', 'U', 'B', 'R', 'G'],
          typeLine: 'Legendary Creature',
          manaCost: '{W}{U}{B}{R}{G}',
          producedMana: [],
          manaValue: 5,
          scryfallId: 'sf-cmd',
        },
        triome: {
          colourIdentity: ['W', 'B', 'R'],
          typeLine: 'Land',
          manaCost: '',
          producedMana: ['W', 'B', 'R'],
          manaValue: 0,
          scryfallId: 'sf-triome',
        },
        wrath: {
          colourIdentity: ['W'],
          typeLine: 'Sorcery',
          manaCost: '{2}{W}{W}{W}',
          producedMana: [],
          manaValue: 5,
          scryfallId: 'sf-wrath',
        },
      },
    );

    const next = recalculateAutoBasics(base);
    const byName = new Map(
      listBasicLandStacks(next).map((c) => [c.name, c.quantity] as const),
    );
    expect((byName.get('Plains') || 0) + (byName.get('Snow-Covered Plains') || 0)).toBeGreaterThanOrEqual(2);
  });

  it('uses existing nonbasic land sources toward the source floor', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Kenrith',
      primaryCategory: 'Commander',
      categories: ['Commander'],
      scryfallId: 'sf-cmd',
    });
    const tower = card({
      instanceId: 'tower',
      name: 'Command Tower',
      primaryCategory: 'Land',
      categories: ['Land'],
      scryfallId: 'sf-tower',
    });
    const fountain = card({
      instanceId: 'fountain',
      name: 'Hallowed Fountain',
      primaryCategory: 'Land',
      categories: ['Land'],
      scryfallId: 'sf-fountain',
    });
    const spell = card({
      instanceId: 'wrath',
      name: 'Wrath of God',
      primaryCategory: 'Other',
      categories: ['Other'],
      scryfallId: 'sf-wrath',
    });
    const base = withOracle(
      deck({
        categories: [
          { name: 'Commander', includedInDeck: true, includedInPrice: true, target: 1 },
          { name: 'Land', includedInDeck: true, includedInPrice: true, target: 5 },
          { name: 'Other', includedInDeck: true, includedInPrice: true, target: null },
        ],
      }),
      [cmd, tower, fountain, spell],
      {
        cmd: {
          colourIdentity: ['W', 'U', 'B', 'R', 'G'],
          typeLine: 'Legendary Creature',
          manaCost: '{W}{U}{B}{R}{G}',
          producedMana: [],
          manaValue: 5,
          scryfallId: 'sf-cmd',
        },
        tower: {
          colourIdentity: ['W', 'U', 'B', 'R', 'G'],
          typeLine: 'Land',
          manaCost: '',
          producedMana: ['W', 'U', 'B', 'R', 'G'],
          manaValue: 0,
          scryfallId: 'sf-tower',
        },
        fountain: {
          colourIdentity: ['W', 'U'],
          typeLine: 'Land — Plains Island',
          manaCost: '',
          producedMana: ['W', 'U'],
          manaValue: 0,
          scryfallId: 'sf-fountain',
        },
        wrath: {
          colourIdentity: ['W'],
          typeLine: 'Sorcery',
          manaCost: '{2}{W}{W}{W}',
          producedMana: [],
          manaValue: 5,
          scryfallId: 'sf-wrath',
        },
      },
    );

    const next = recalculateAutoBasics(base);
    const byName = new Map(
      listBasicLandStacks(next).map((c) => [c.name, c.quantity] as const),
    );
    expect((byName.get('Plains') || 0) + (byName.get('Snow-Covered Plains') || 0)).toBeGreaterThanOrEqual(1);
  });

  it('does not count nonland mana producers toward the land-source floor', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Kenrith',
      primaryCategory: 'Commander',
      categories: ['Commander'],
      scryfallId: 'sf-cmd',
    });
    const rock = card({
      instanceId: 'rock',
      name: 'Arcane Signet',
      primaryCategory: 'Other',
      categories: ['Other'],
      scryfallId: 'sf-rock',
    });
    const spell = card({
      instanceId: 'wrath',
      name: 'Wrath of God',
      primaryCategory: 'Other',
      categories: ['Other'],
      scryfallId: 'sf-wrath',
    });
    const base = withOracle(
      deck({
        categories: [
          { name: 'Commander', includedInDeck: true, includedInPrice: true, target: 3 },
          { name: 'Land', includedInDeck: true, includedInPrice: true, target: 3 },
          { name: 'Other', includedInDeck: true, includedInPrice: true, target: null },
        ],
      }),
      [cmd, rock, spell],
      {
        cmd: {
          colourIdentity: ['W', 'U', 'B', 'R', 'G'],
          typeLine: 'Legendary Creature',
          manaCost: '{W}{U}{B}{R}{G}',
          producedMana: [],
          manaValue: 5,
          scryfallId: 'sf-cmd',
        },
        rock: {
          colourIdentity: ['W', 'U', 'B', 'R', 'G'],
          typeLine: 'Artifact',
          manaCost: '{2}',
          producedMana: ['W', 'U', 'B', 'R', 'G'],
          manaValue: 2,
          scryfallId: 'sf-rock',
        },
        wrath: {
          colourIdentity: ['W'],
          typeLine: 'Sorcery',
          manaCost: '{2}{W}{W}{W}',
          producedMana: [],
          manaValue: 5,
          scryfallId: 'sf-wrath',
        },
      },
    );

    const next = recalculateAutoBasics(base);
    const byName = new Map(
      listBasicLandStacks(next).map((c) => [c.name, c.quantity] as const),
    );
    expect((byName.get('Plains') || 0) + (byName.get('Snow-Covered Plains') || 0)).toBe(3);
  });

  it('spends the full budget when the floor exceeds available land slots', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Kenrith',
      primaryCategory: 'Commander',
      categories: ['Commander'],
      scryfallId: 'sf-cmd',
    });
    const spell = card({
      instanceId: 'wrath',
      name: 'Wrath of God',
      primaryCategory: 'Other',
      categories: ['Other'],
      scryfallId: 'sf-wrath',
    });
    const base = withOracle(
      deck({
        categories: [
          { name: 'Commander', includedInDeck: true, includedInPrice: true, target: 1 },
          { name: 'Land', includedInDeck: true, includedInPrice: true, target: 2 },
          { name: 'Other', includedInDeck: true, includedInPrice: true, target: null },
        ],
      }),
      [cmd, spell],
      {
        cmd: {
          colourIdentity: ['W', 'U', 'B', 'R', 'G'],
          typeLine: 'Legendary Creature',
          manaCost: '{W}{U}{B}{R}{G}',
          producedMana: [],
          manaValue: 5,
          scryfallId: 'sf-cmd',
        },
        wrath: {
          colourIdentity: ['W'],
          typeLine: 'Sorcery',
          manaCost: '{2}{W}{W}{W}',
          producedMana: [],
          manaValue: 5,
          scryfallId: 'sf-wrath',
        },
      },
    );

    const next = recalculateAutoBasics(base);
    const basics = listBasicLandStacks(next);
    expect(basics.reduce((s, c) => s + c.quantity, 0)).toBe(2);
    const byName = new Map(basics.map((c) => [c.name, c.quantity] as const));
    expect((byName.get('Plains') || 0) + (byName.get('Snow-Covered Plains') || 0)).toBe(2);
  });

  it('protects a meaningful white share in an ancient-zubera-like five-colour deck', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'General',
      primaryCategory: 'Commander',
      categories: ['Commander'],
      scryfallId: 'sf-cmd',
    });
    const lands = [
      card({ instanceId: 'w1', name: 'Obscura Storefront', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-w1' }),
      card({ instanceId: 'w2', name: 'Brokers Hideout', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-w2' }),
      card({ instanceId: 'u1', name: 'Land U1', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-u1' }),
      card({ instanceId: 'u2', name: 'Land U2', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-u2' }),
      card({ instanceId: 'b1', name: 'Land B1', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-b1' }),
      card({ instanceId: 'b2', name: 'Land B2', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-b2' }),
      card({ instanceId: 'r1', name: 'Land R1', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-r1' }),
      card({ instanceId: 'r2', name: 'Land R2', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-r2' }),
      card({ instanceId: 'g1', name: 'Land G1', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-g1' }),
      card({ instanceId: 'g2', name: 'Land G2', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-g2' }),
      card({ instanceId: 'c1', name: 'Escape Tunnel', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-c1' }),
      card({ instanceId: 'c2', name: 'Vibrant Cityscape', quantity: 1, primaryCategory: 'Land', categories: ['Land'], scryfallId: 'sf-c2' }),
    ];
    const spells = [
      card({ instanceId: 'ww', name: 'Irregular Cohort', primaryCategory: 'Other', categories: ['Other'], scryfallId: 'sf-ww' }),
      card({ instanceId: 'u7', name: 'Blue Load', quantity: 7, primaryCategory: 'Other', categories: ['Other'], scryfallId: 'sf-u7' }),
      card({ instanceId: 'u2', name: 'Blue Double', quantity: 2, primaryCategory: 'Other', categories: ['Other'], scryfallId: 'sf-u2s' }),
      card({ instanceId: 'b13', name: 'Black Load', quantity: 13, primaryCategory: 'Other', categories: ['Other'], scryfallId: 'sf-b13' }),
      card({ instanceId: 'b5', name: 'Black Double', quantity: 5, primaryCategory: 'Other', categories: ['Other'], scryfallId: 'sf-b5' }),
      card({ instanceId: 'r8', name: 'Red Load', quantity: 8, primaryCategory: 'Other', categories: ['Other'], scryfallId: 'sf-r8' }),
      card({ instanceId: 'g7', name: 'Green Load', quantity: 7, primaryCategory: 'Other', categories: ['Other'], scryfallId: 'sf-g7' }),
      card({ instanceId: 'w10', name: 'White Load', quantity: 10, primaryCategory: 'Other', categories: ['Other'], scryfallId: 'sf-w10' }),
      card({ instanceId: 'hy', name: 'Hybrid White', quantity: 3, primaryCategory: 'Other', categories: ['Other'], scryfallId: 'sf-hy' }),
    ];
    const base = withOracle(
      deck({
        categories: [
          { name: 'Commander', includedInDeck: true, includedInPrice: true, target: 1 },
          { name: 'Land', includedInDeck: true, includedInPrice: true, target: 36 },
          { name: 'Other', includedInDeck: true, includedInPrice: true, target: null },
        ],
      }),
      [cmd, ...lands, ...spells],
      {
        cmd: {
          colourIdentity: ['W', 'U', 'B', 'R', 'G'],
          typeLine: 'Legendary Creature',
          manaCost: '{W}{U}{B}{R}{G}',
          producedMana: [],
          manaValue: 5,
          scryfallId: 'sf-cmd',
        },
        w1: { colourIdentity: ['W'], typeLine: 'Land', manaCost: '', producedMana: ['W'], manaValue: 0, scryfallId: 'sf-w1' },
        w2: { colourIdentity: ['W'], typeLine: 'Land', manaCost: '', producedMana: ['W'], manaValue: 0, scryfallId: 'sf-w2' },
        u1: { colourIdentity: ['U'], typeLine: 'Land', manaCost: '', producedMana: ['U'], manaValue: 0, scryfallId: 'sf-u1' },
        u2: { colourIdentity: ['U'], typeLine: 'Land', manaCost: '', producedMana: ['U'], manaValue: 0, scryfallId: 'sf-u2' },
        b1: { colourIdentity: ['B'], typeLine: 'Land', manaCost: '', producedMana: ['B'], manaValue: 0, scryfallId: 'sf-b1' },
        b2: { colourIdentity: ['B'], typeLine: 'Land', manaCost: '', producedMana: ['B'], manaValue: 0, scryfallId: 'sf-b2' },
        r1: { colourIdentity: ['R'], typeLine: 'Land', manaCost: '', producedMana: ['R'], manaValue: 0, scryfallId: 'sf-r1' },
        r2: { colourIdentity: ['R'], typeLine: 'Land', manaCost: '', producedMana: ['R'], manaValue: 0, scryfallId: 'sf-r2' },
        g1: { colourIdentity: ['G'], typeLine: 'Land', manaCost: '', producedMana: ['G'], manaValue: 0, scryfallId: 'sf-g1' },
        g2: { colourIdentity: ['G'], typeLine: 'Land', manaCost: '', producedMana: ['G'], manaValue: 0, scryfallId: 'sf-g2' },
        c1: { colourIdentity: [], typeLine: 'Land', manaCost: '', producedMana: [], manaValue: 0, scryfallId: 'sf-c1' },
        c2: { colourIdentity: [], typeLine: 'Land', manaCost: '', producedMana: [], manaValue: 0, scryfallId: 'sf-c2' },
        ww: { colourIdentity: ['W'], typeLine: 'Creature', manaCost: '{2}{W}{W}', producedMana: [], manaValue: 4, scryfallId: 'sf-ww' },
        u7: { colourIdentity: ['U'], typeLine: 'Instant', manaCost: '{U}', producedMana: [], manaValue: 1, scryfallId: 'sf-u7' },
        u2s: { colourIdentity: ['U'], typeLine: 'Instant', manaCost: '{U}{U}', producedMana: [], manaValue: 2, scryfallId: 'sf-u2s' },
        b13: { colourIdentity: ['B'], typeLine: 'Sorcery', manaCost: '{B}', producedMana: [], manaValue: 1, scryfallId: 'sf-b13' },
        b5: { colourIdentity: ['B'], typeLine: 'Sorcery', manaCost: '{B}{B}', producedMana: [], manaValue: 2, scryfallId: 'sf-b5' },
        r8: { colourIdentity: ['R'], typeLine: 'Instant', manaCost: '{R}', producedMana: [], manaValue: 1, scryfallId: 'sf-r8' },
        g7: { colourIdentity: ['G'], typeLine: 'Creature', manaCost: '{G}', producedMana: [], manaValue: 1, scryfallId: 'sf-g7' },
        w10: { colourIdentity: ['W'], typeLine: 'Creature', manaCost: '{W}', producedMana: [], manaValue: 1, scryfallId: 'sf-w10' },
        hy: { colourIdentity: ['W', 'B'], typeLine: 'Creature', manaCost: '{2}{W/B}', producedMana: [], manaValue: 3, scryfallId: 'sf-hy' },
      },
    );

    const analysis = calculateAutoBasicsBreakdown(base);
    expect(analysis).not.toBeNull();
    const white = analysis!.colourBreakdown.find((row) => row.colour === 'W');
    expect(white?.existingLandSources).toBe(2);
    expect(white?.minimumSourceGoal).toBeGreaterThan(white?.singleCardFloor || 0);

    const next = recalculateAutoBasics(base);
    const byName = new Map(
      listBasicLandStacks(next).map((c) => [c.name, c.quantity] as const),
    );
    expect((byName.get('Plains') || 0) + (byName.get('Snow-Covered Plains') || 0)).toBeGreaterThanOrEqual(2);
  });

  it('shouldRecalculateAutoBasics ignores basic-only edits', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Cmd',
      primaryCategory: 'Commander',
      categories: ['Commander'],
      scryfallId: 'sf-cmd',
    });
    const forest = card({
      instanceId: 'f1',
      name: 'Forest',
      quantity: 4,
      primaryCategory: 'Land',
      categories: ['Land'],
    });
    const prev = withOracle(deck(), [cmd, forest], {
      cmd: {
        colourIdentity: ['G'],
        typeLine: 'Legendary Creature',
        manaCost: '{G}',
        producedMana: [],
        manaValue: 1,
        scryfallId: 'sf-cmd',
      },
    });
    const nextBasics = {
      ...prev,
      cards: prev.cards.map((c) =>
        c.instanceId === 'f1' ? { ...c, quantity: 8 } : c,
      ),
    };
    expect(shouldRecalculateAutoBasics(prev, nextBasics)).toBe(false);

    const nextSpell = {
      ...prev,
      cards: [
        ...prev.cards,
        card({
          instanceId: 'bolt',
          name: 'Bolt',
          primaryCategory: 'Other',
          categories: ['Other'],
        }),
      ],
    };
    expect(shouldRecalculateAutoBasics(prev, nextSpell)).toBe(true);
  });
});
