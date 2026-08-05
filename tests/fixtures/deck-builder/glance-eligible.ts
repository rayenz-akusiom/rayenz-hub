import type { CardInstance, DeckDocument } from '@rayenz-hub/shared';

const BASE_CATEGORIES = [
  { name: 'Commander', includedInDeck: true, includedInPrice: true },
  { name: 'Creature', includedInDeck: true, includedInPrice: true },
  { name: 'Instant', includedInDeck: true, includedInPrice: true },
  { name: 'Land', includedInDeck: true, includedInPrice: true },
  { name: 'Queued In', includedInDeck: false, includedInPrice: false },
  { name: 'Queued Out', includedInDeck: false, includedInPrice: false },
];

export function buildEligibleCommanderDeck(overrides: Partial<DeckDocument> = {}): DeckDocument {
  const cards: CardInstance[] = [
    {
      instanceId: 'cmd-1',
      name: 'Atraxa, Praetors Voice',
      quantity: 1,
      primaryCategory: 'Commander',
      categories: ['Commander'],
      stack: null,
      setCode: 'm3c',
      collectorNumber: '1',
      scryfallId: null,
      archidektCardId: null,
      foil: false,
      proxy: false,
    },
  ];

  for (let i = 0; i < 80; i++) {
    cards.push({
      instanceId: `spell-${i}`,
      name: `Spell ${i}`,
      quantity: 1,
      primaryCategory: 'Instant',
      categories: ['Instant'],
      stack: null,
      setCode: 'm12',
      collectorNumber: String(100 + i),
      scryfallId: null,
      archidektCardId: null,
      foil: false,
      proxy: false,
    });
  }

  cards.push({
    instanceId: 'forest-stack',
    name: 'Forest',
    quantity: 19,
    primaryCategory: 'Land',
    categories: ['Land'],
    stack: null,
    setCode: 'm12',
    collectorNumber: '246',
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
  });

  const oracle: DeckDocument['oracle'] = {
    'print:m3c:1': {
      scryfallId: null,
      colourIdentity: ['W', 'U', 'B', 'G'],
      colours: ['W', 'U', 'B', 'G'],
      typeLine: 'Legendary Creature — Phyrexian Angel',
      layout: 'normal',
      keywords: null,
      partnerWith: null,
      oracleText: null,
      printedName: null,
      flavorName: null,
      manaValue: 4,
      imageUrl: null,
      finishes: null,
      updatedAt: null,
    },
  };

  for (let i = 0; i < 80; i++) {
    oracle[`print:m12:${100 + i}`] = {
      scryfallId: null,
      colourIdentity: ['U'],
      colours: ['U'],
      typeLine: 'Instant',
      layout: 'normal',
      keywords: null,
      partnerWith: null,
      oracleText: null,
      printedName: null,
      flavorName: null,
      manaValue: 2,
      imageUrl: null,
      finishes: null,
      updatedAt: null,
    };
  }

  oracle['print:m12:246'] = {
    scryfallId: null,
    colourIdentity: ['G'],
    colours: ['G'],
    typeLine: 'Basic Land — Forest',
    layout: 'normal',
    keywords: null,
    partnerWith: null,
    oracleText: null,
    printedName: null,
    flavorName: null,
    manaValue: 0,
    imageUrl: null,
    finishes: null,
    updatedAt: null,
  };

  return {
    schemaVersion: 1,
    deckId: 'glance-eligible',
    name: 'Glance Fixture',
    format: 'commander',
    archidektId: null,
    archidektUrl: null,
    categories: BASE_CATEGORIES,
    cards,
    oracle,
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    ...overrides,
  };
}

/** 100-card deck whose lieutenant count exceeds the glance highlight limit. */
export function buildMultiLieutenantCommanderDeck(
  lieutenantCount = 4,
  overrides: Partial<DeckDocument> = {},
): DeckDocument {
  const base = buildEligibleCommanderDeck();
  const cards = base.cards.map((c, index) =>
    index >= 1 && index <= lieutenantCount
      ? {
          ...c,
          name: `Lieutenant ${index}`,
          primaryCategory: 'Lieutenants',
          categories: ['Lieutenants'],
        }
      : { ...c },
  );
  return buildEligibleCommanderDeck({
    ...base,
    ...overrides,
    deckId: overrides.deckId ?? 'glance-lieutenants',
    categories: [
      ...base.categories,
      { name: 'Lieutenants', includedInDeck: true, includedInPrice: true },
    ],
    cards,
  });
}

/** 100-card deck with one formal swap In/Out pair for glance eligibility tests. */
export function buildGlanceSwapCommanderDeck(overrides: Partial<DeckDocument> = {}): DeckDocument {
  const base = buildEligibleCommanderDeck();
  const cards = base.cards.map((c) => ({ ...c }));
  const swapIn: CardInstance = {
    instanceId: 'swap-in-1',
    name: 'Swap In Spell',
    quantity: 1,
    primaryCategory: 'Instant',
    categories: ['Instant'],
    stack: null,
    setCode: 'm12',
    collectorNumber: '999',
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
  };
  cards.push(swapIn);
  return buildEligibleCommanderDeck({
    ...base,
    ...overrides,
    deckId: overrides.deckId ?? 'glance-swap',
    cards,
    formalSwapEntries: [
      {
        id: 'swap-1',
        inInstanceId: 'swap-in-1',
        outInstanceId: 'spell-0',
        inTargetCategory: 'Instant',
        sortIndex: 0,
        notes: null,
      },
    ],
  });
}

/** Assign non-commander cards round-robin across category names; set deck categories. */
export function redistributeAcrossCategories(
  deck: DeckDocument,
  categoryNames: string[],
  options?: { keepLandCategory?: boolean },
): DeckDocument {
  let ci = 0;
  const cards = deck.cards.map((c) => {
    if (c.primaryCategory === 'Commander') return c;
    if (options?.keepLandCategory && (c.primaryCategory === 'Land' || c.name === 'Forest')) {
      return { ...c, primaryCategory: 'Land', categories: ['Land'] };
    }
    const pool = options?.keepLandCategory
      ? categoryNames.filter((n) => n !== 'Land')
      : categoryNames;
    const cat = pool[ci % pool.length]!;
    ci += 1;
    return { ...c, primaryCategory: cat, categories: [cat] };
  });
  return {
    ...deck,
    categories: [
      { name: 'Commander', includedInDeck: true, includedInPrice: true },
      ...categoryNames.map((name) => ({
        name,
        includedInDeck: true,
        includedInPrice: true,
      })),
    ],
    cards,
  };
}

/** Move every Nth Instant card into Creature so both categories appear. */
export function splitInstantIntoCreature(deck: DeckDocument, everyN = 3): DeckDocument {
  return {
    ...deck,
    categories: [
      { name: 'Commander', includedInDeck: true, includedInPrice: true },
      { name: 'Land', includedInDeck: true, includedInPrice: true },
      { name: 'Instant', includedInDeck: true, includedInPrice: true },
      { name: 'Creature', includedInDeck: true, includedInPrice: true },
    ],
    cards: deck.cards.map((c, i) =>
      c.primaryCategory === 'Instant' && i % everyN === 0
        ? { ...c, primaryCategory: 'Creature', categories: ['Creature'] }
        : c,
    ),
  };
}
