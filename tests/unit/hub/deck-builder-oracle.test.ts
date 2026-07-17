import { describe, expect, it } from 'vitest';
import {
  cardDisplayName,
  cardImageUrl,
  cardOracleFromScryfall,
  DeckDocumentSchema,
  migrateDeckDocument,
  needsOracleEnrich,
  oracleKey,
  oracleSatisfiesCard,
  resolveCardView,
  upsertOracle,
} from '@rayenz-hub/shared';

describe('oracleKey', () => {
  it('prefers id over print and name', () => {
    expect(
      oracleKey({
        scryfallId: 'ABC-123',
        setCode: 'cmm',
        collectorNumber: '1',
        name: 'Sol Ring',
      }),
    ).toBe('id:abc-123');
  });

  it('uses print key when id is missing', () => {
    expect(
      oracleKey({
        scryfallId: null,
        setCode: 'CMM',
        collectorNumber: '1',
        name: 'Sol Ring',
      }),
    ).toBe('print:cmm:1');
  });

  it('falls back to name when id and print are missing', () => {
    expect(
      oracleKey({
        scryfallId: null,
        setCode: null,
        collectorNumber: null,
        name: 'Sol Ring',
      }),
    ).toBe('name:sol ring');
  });
});

describe('migrateDeckDocument', () => {
  it('moves legacy CI/type/layout into oracle and strips from cards', () => {
    const raw = {
      deckId: 'd1',
      cards: [
        {
          instanceId: 'c1',
          name: 'Lightning Bolt',
          quantity: 1,
          primaryCategory: 'Other',
          categories: ['Other'],
          colourIdentity: ['R'],
          typeLine: 'Instant',
          layout: 'normal',
          scryfallId: 'bolt-id',
        },
      ],
      oracle: {},
    };
    const migrated = migrateDeckDocument(raw);
    expect(migrated.cards[0]).not.toHaveProperty('colourIdentity');
    expect(migrated.cards[0]).not.toHaveProperty('typeLine');
    expect(migrated.cards[0]).not.toHaveProperty('layout');
    const key = oracleKey(migrated.cards[0]);
    expect(migrated.oracle[key]).toMatchObject({
      colourIdentity: ['R'],
      typeLine: 'Instant',
      layout: 'normal',
      scryfallId: 'bolt-id',
    });
    expect(migrated.oracle[key].imageUrl).toContain('bolt-id');
    expect(migrated.schemaVersion).toBe(2);
  });

  it('clears dual type-line layouts once when schemaVersion < 2', () => {
    const key = 'name:emeritus of ideation // ancestral recall';
    const raw = {
      schemaVersion: 1,
      deckId: 'd1',
      cards: [
        {
          instanceId: 'c1',
          name: 'Emeritus of Ideation // Ancestral Recall',
          quantity: 1,
          primaryCategory: 'Other',
          categories: ['Other'],
          scryfallId: null,
          setCode: null,
          collectorNumber: null,
          archidektCardId: null,
          foil: false,
          stack: null,
        },
      ],
      oracle: {
        [key]: {
          scryfallId: null,
          colourIdentity: ['U'],
          typeLine: 'Creature — Human Wizard // Instant',
          layout: 'transform',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: 5,
          imageUrl: null,
          updatedAt: null,
        },
      },
    };
    const migrated = migrateDeckDocument(raw);
    expect(migrated.oracle[key].layout).toBeNull();
    expect(migrated.schemaVersion).toBe(2);

    // Second pass must not clear a corrected Scryfall layout.
    const corrected = {
      ...migrated,
      oracle: {
        ...migrated.oracle,
        [key]: { ...migrated.oracle[key], layout: 'prepare' },
      },
    };
    const again = migrateDeckDocument(corrected);
    expect(again.oracle[key].layout).toBe('prepare');
    expect(again.schemaVersion).toBe(2);
  });

  it('runs via DeckDocumentSchema.parse preprocess', () => {
    const doc = DeckDocumentSchema.parse({
      schemaVersion: 1,
      deckId: 'd1',
      name: 'Test',
      format: 'commander',
      cards: [
        {
          instanceId: 'c1',
          name: 'Forest',
          quantity: 1,
          primaryCategory: 'Land',
          colourIdentity: ['G'],
          typeLine: 'Basic Land — Forest',
        },
      ],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(doc.cards[0]).not.toHaveProperty('colourIdentity');
    expect(Object.keys(doc.oracle)).toHaveLength(1);
    expect(doc.schemaVersion).toBe(2);
  });
});

describe('resolveCardView', () => {
  it('merges oracle fields onto the lean card', () => {
    const card = {
      instanceId: 'c1',
      name: 'Sol Ring',
      quantity: 1,
      primaryCategory: 'Ramp',
      categories: ['Ramp'],
      stack: null,
      setCode: 'cmm',
      collectorNumber: '1',
      scryfallId: 'ring-id',
      archidektCardId: null,
      foil: false,
    };
    const view = resolveCardView(card, {
      scryfallId: 'ring-id',
      colourIdentity: [],
      typeLine: 'Artifact',
      layout: 'normal',
      keywords: null,
      partnerWith: null,
      oracleText: null,
      printedName: null,
      flavorName: null,
      manaValue: 1,
      imageUrl: 'https://cdn.example/ring.jpg',
      updatedAt: null,
    });
    expect(view.typeLine).toBe('Artifact');
    expect(view.colourIdentity).toEqual([]);
    expect(view.imageUrl).toBe('https://cdn.example/ring.jpg');
    expect(view.manaValue).toBe(1);
    expect(view.instanceId).toBe('c1');
  });
});

describe('cardDisplayName', () => {
  it('prefers flavorName, then printedName, then canonical name', () => {
    expect(
      cardDisplayName({
        name: 'Mysterious Egg',
        printedName: '不思議な卵',
        flavorName: "Mothra's Great Cocoon",
      }),
    ).toBe("Mothra's Great Cocoon");
    expect(
      cardDisplayName({
        name: 'Arvinox, the Mind Flail',
        printedName: 'Mind Flayer, the Shadow',
        flavorName: null,
      }),
    ).toBe('Mind Flayer, the Shadow');
    expect(cardDisplayName({ name: 'Sol Ring', printedName: null, flavorName: null })).toBe(
      'Sol Ring',
    );
  });
});

describe('cardImageUrl', () => {
  it('prefers imageUrl over scryfall id derivation', () => {
    expect(
      cardImageUrl({
        imageUrl: 'https://cdn.example/front.jpg',
        scryfallId: 'abc-123',
        name: 'X',
        setCode: null,
        collectorNumber: null,
      }),
    ).toBe('https://cdn.example/front.jpg');
  });
});

describe('upsertOracle layout merge', () => {
  it('lets Scryfall prepare overwrite provisional transform', () => {
    const key = 'name:emeritus of ideation // ancestral recall';
    let oracle = upsertOracle({}, key, {
      colourIdentity: ['U'],
      typeLine: 'Creature — Human Wizard // Instant',
      layout: 'transform',
      manaValue: 5,
    });
    expect(oracle[key].layout).toBe('transform');

    const fromScryfall = cardOracleFromScryfall({
      id: '75961d36-acf6-425f-9698-0bf52af74f31',
      type_line: 'Creature — Human Wizard // Instant',
      color_identity: ['U'],
      layout: 'prepare',
      cmc: 5,
    });
    oracle = upsertOracle(oracle, key, fromScryfall);
    expect(oracle[key].layout).toBe('prepare');
  });

  it('keeps existing layout when incoming omits layout', () => {
    const key = 'name:delver of secrets // insectile aberration';
    let oracle = upsertOracle({}, key, {
      layout: 'transform',
      typeLine: 'Creature — Human Wizard // Creature — Human Insect',
      colourIdentity: ['U'],
      manaValue: 1,
    });
    oracle = upsertOracle(oracle, key, {
      typeLine: 'Creature — Human Wizard // Creature — Human Insect',
    });
    expect(oracle[key].layout).toBe('transform');
  });
});

describe('needsOracleEnrich', () => {
  it('is false when oracle is complete for a non-leader', () => {
    const card = {
      instanceId: 'c1',
      name: 'Bolt',
      quantity: 1,
      primaryCategory: 'Other',
      categories: ['Other'],
      stack: null,
      setCode: null,
      collectorNumber: null,
      scryfallId: null,
      archidektCardId: null,
      foil: false,
    };
    const doc = {
      oracle: {
        [oracleKey(card)]: {
          scryfallId: null,
          colourIdentity: ['R'],
          typeLine: 'Instant',
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: 1,
          imageUrl: null,
          updatedAt: null,
        },
      },
    };
    expect(needsOracleEnrich(doc, card)).toBe(false);
  });

  it('is true when manaValue is missing (backfill printed names / CMC)', () => {
    const card = {
      instanceId: 'c1',
      name: 'Bolt',
      quantity: 1,
      primaryCategory: 'Other',
      categories: ['Other'],
      stack: null,
      setCode: null,
      collectorNumber: null,
      scryfallId: null,
      archidektCardId: null,
      foil: false,
    };
    const doc = {
      oracle: {
        [oracleKey(card)]: {
          scryfallId: null,
          colourIdentity: ['R'],
          typeLine: 'Instant',
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: null,
          imageUrl: null,
          updatedAt: null,
        },
      },
    };
    expect(needsOracleEnrich(doc, card)).toBe(true);
  });

  it('requires layout when type line is dual-named', () => {
    const card = {
      instanceId: 'c1',
      name: 'Emeritus of Ideation // Ancestral Recall',
      quantity: 1,
      primaryCategory: 'Other',
      categories: ['Other'],
      stack: null,
      setCode: null,
      collectorNumber: null,
      scryfallId: null,
      archidektCardId: null,
      foil: false,
    };
    const baseOracle = {
      scryfallId: null,
      colourIdentity: ['U'] as ('U')[],
      typeLine: 'Creature — Human Wizard // Instant',
      layout: null as string | null,
      keywords: null,
      partnerWith: null,
      oracleText: null,
      printedName: null,
      flavorName: null,
      manaValue: 5,
      imageUrl: null,
      updatedAt: null,
    };
    expect(oracleSatisfiesCard(baseOracle, card)).toBe(false);
    expect(needsOracleEnrich({ oracle: { [oracleKey(card)]: baseOracle } }, card)).toBe(true);
    expect(oracleSatisfiesCard({ ...baseOracle, layout: 'prepare' }, card)).toBe(true);
  });
});
