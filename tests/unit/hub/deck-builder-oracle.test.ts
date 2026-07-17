import { describe, expect, it } from 'vitest';
import {
  cardImageUrl,
  DeckDocumentSchema,
  migrateDeckDocument,
  needsOracleEnrich,
  oracleKey,
  resolveCardView,
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
      imageUrl: 'https://cdn.example/ring.jpg',
      updatedAt: null,
    });
    expect(view.typeLine).toBe('Artifact');
    expect(view.colourIdentity).toEqual([]);
    expect(view.imageUrl).toBe('https://cdn.example/ring.jpg');
    expect(view.instanceId).toBe('c1');
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
          imageUrl: null,
          updatedAt: null,
        },
      },
    };
    expect(needsOracleEnrich(doc, card)).toBe(false);
  });
});
