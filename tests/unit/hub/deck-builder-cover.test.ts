import { describe, it, expect } from 'vitest';
import {
  deckCoverImageUrl,
  deckCoverImageUrlSecondary,
  DeckDocumentSchema,
  oracleKey,
  pickCoverPartnerStatus,
  pickDeckCoverCards,
  toDeckSummary,
  type CardInstance,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { sortLibraryDecks } from '../../../packages/web/src/deck-builder/library/LibraryView.tsx';

type LegacyCard = CardInstance & {
  colourIdentity?: ('W' | 'U' | 'B' | 'R' | 'G')[];
  typeLine?: string | null;
  layout?: string | null;
  keywords?: string[] | null;
  partnerWith?: string | null;
};

function card(
  over: Partial<LegacyCard> & Pick<LegacyCard, 'name' | 'instanceId' | 'primaryCategory'>,
): LegacyCard {
  const scryfallId = over.scryfallId ?? `${over.instanceId}-scryfall-id`;
  return {
    quantity: 1,
    categories: [over.primaryCategory],
    stack: null,
    setCode: 'c16',
    collectorNumber: '1',
    colourIdentity: ['G'],
    typeLine: 'Legendary Creature',
    layout: 'normal',
    keywords: null,
    partnerWith: null,
    archidektCardId: null,
    foil: false,
    ...over,
    scryfallId,
  };
}

function doc(cards: LegacyCard[], format: DeckDocument['format'] = 'commander'): DeckDocument {
  return DeckDocumentSchema.parse({
    schemaVersion: 1,
    deckId: 'd1',
    name: 'Test',
    format,
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards,
    oracle: {},
    formalSwapEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
  });
}

describe('deck cover partners', () => {
  it('returns two cover cards for two Commander partners', () => {
    const d = doc([
      card({
        instanceId: 'a',
        name: 'A',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
      card({
        instanceId: 'b',
        name: 'B',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
      card({ instanceId: 'c', name: 'Sol Ring', primaryCategory: 'Ramp' }),
    ]);
    const covers = pickDeckCoverCards(d);
    expect(covers.map((c) => c.name)).toEqual(['A', 'B']);
    expect(deckCoverImageUrl(d)).toContain('a-scryfall-id');
    expect(deckCoverImageUrlSecondary(d)).toContain('b-scryfall-id');
    expect(pickCoverPartnerStatus(d)).toBe('legal');
  });

  it('does not use a Lieutenant as secondary cover', () => {
    const d = doc([
      card({
        instanceId: 'a',
        name: 'A',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
      card({
        instanceId: 'b',
        name: 'B',
        primaryCategory: 'Lieutenants',
        keywords: ['Partner'],
      }),
    ]);
    expect(pickDeckCoverCards(d).map((c) => c.name)).toEqual(['A']);
    expect(deckCoverImageUrlSecondary(d)).toBeNull();
    expect(pickCoverPartnerStatus(d)).toBeNull();
  });

  it('marks illegal pairs but still returns secondary cover', () => {
    const d = doc([
      card({
        instanceId: 'a',
        name: 'A',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
      card({
        instanceId: 'b',
        name: 'B',
        primaryCategory: 'Commander',
        keywords: ['Friends forever'],
      }),
    ]);
    expect(pickCoverPartnerStatus(d)).toBe('illegal');
    expect(deckCoverImageUrlSecondary(d)).toBeTruthy();
  });

  it('has no secondary cover for a single commander', () => {
    const d = doc([
      card({
        instanceId: 'a',
        name: 'A',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
    ]);
    expect(deckCoverImageUrlSecondary(d)).toBeNull();
    expect(pickCoverPartnerStatus(d)).toBeNull();
  });

  it('uses coverInstanceId override as a single cover face', () => {
    const d = DeckDocumentSchema.parse({
      ...doc([
        card({
          instanceId: 'a',
          name: 'A',
          primaryCategory: 'Commander',
          keywords: ['Partner'],
        }),
        card({
          instanceId: 'b',
          name: 'B',
          primaryCategory: 'Commander',
          keywords: ['Partner'],
        }),
        card({ instanceId: 'c', name: 'Sol Ring', primaryCategory: 'Ramp' }),
      ]),
      coverInstanceId: 'c',
    });
    expect(pickDeckCoverCards(d).map((c) => c.name)).toEqual(['Sol Ring']);
    expect(deckCoverImageUrl(d)).toContain('c-scryfall-id');
    expect(deckCoverImageUrlSecondary(d)).toBeNull();
    expect(pickCoverPartnerStatus(d)).toBeNull();
  });

  it('falls back to heuristic when coverInstanceId is missing from the deck', () => {
    const d = DeckDocumentSchema.parse({
      ...doc([
        card({
          instanceId: 'a',
          name: 'A',
          primaryCategory: 'Commander',
          keywords: ['Partner'],
        }),
        card({
          instanceId: 'b',
          name: 'B',
          primaryCategory: 'Commander',
          keywords: ['Partner'],
        }),
      ]),
      coverInstanceId: 'gone',
    });
    expect(pickDeckCoverCards(d).map((c) => c.name)).toEqual(['A', 'B']);
    expect(pickCoverPartnerStatus(d)).toBe('legal');
  });
});

describe('toDeckSummary coverCardName', () => {
  it('uses printed face name for library cover sort', () => {
    const commander = card({
      instanceId: 'arv',
      name: 'Arvinox, the Mind Flail',
      primaryCategory: 'Commander',
      keywords: [],
      scryfallId: 'sld-340',
    });
    const d = DeckDocumentSchema.parse({
      ...doc([commander]),
      oracle: {
        [oracleKey(commander)]: {
          scryfallId: 'sld-340',
          colourIdentity: ['B'],
          typeLine: 'Legendary Enchantment Creature — Horror',
          layout: 'normal',
          keywords: [],
          partnerWith: null,
          oracleText: null,
          printedName: 'Mind Flayer, the Shadow',
          flavorName: null,
          manaValue: 7,
          imageUrl: null,
          updatedAt: null,
        },
      },
    });
    expect(toDeckSummary(d).coverCardName).toBe('Mind Flayer, the Shadow');
  });

  it('orders library cover sort by printed name (Mind Flayer under M)', () => {
    const arvinox = toDeckSummary(
      DeckDocumentSchema.parse({
        ...doc([
          card({
            instanceId: 'arv',
            name: 'Arvinox, the Mind Flail',
            primaryCategory: 'Commander',
            keywords: [],
            scryfallId: 'sld-340',
          }),
        ]),
        deckId: 'arv-deck',
        name: 'Arvinox Deck',
        oracle: {
          'id:sld-340': {
            scryfallId: 'sld-340',
            colourIdentity: ['B'],
            typeLine: 'Legendary Enchantment Creature — Horror',
            layout: 'normal',
            keywords: [],
            partnerWith: null,
            oracleText: null,
            printedName: 'Mind Flayer, the Shadow',
            flavorName: null,
            manaValue: 7,
            imageUrl: null,
            updatedAt: null,
          },
        },
      }),
    );
    const bolt = toDeckSummary(
      DeckDocumentSchema.parse({
        ...doc([
          card({
            instanceId: 'bolt',
            name: 'Lightning Bolt',
            primaryCategory: 'Commander',
            keywords: [],
            scryfallId: 'bolt-id',
          }),
        ]),
        deckId: 'bolt-deck',
        name: 'Bolt Deck',
        oracle: {
          'id:bolt-id': {
            scryfallId: 'bolt-id',
            colourIdentity: ['R'],
            typeLine: 'Instant',
            layout: 'normal',
            keywords: [],
            partnerWith: null,
            oracleText: null,
            printedName: null,
            flavorName: null,
            manaValue: 1,
            imageUrl: null,
            updatedAt: null,
          },
        },
      }),
    );
    const sorted = sortLibraryDecks([arvinox, bolt], 'cover');
    expect(sorted.map((s) => s.deckId)).toEqual(['bolt-deck', 'arv-deck']);
    expect(arvinox.coverCardName).toBe('Mind Flayer, the Shadow');
  });
});
