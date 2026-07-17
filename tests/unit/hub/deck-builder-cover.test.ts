import { describe, it, expect } from 'vitest';
import {
  deckCoverImageUrl,
  deckCoverImageUrlSecondary,
  DeckDocumentSchema,
  pickCoverPartnerStatus,
  pickDeckCoverCards,
  type CardInstance,
  type DeckDocument,
} from '@rayenz-hub/shared';

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
