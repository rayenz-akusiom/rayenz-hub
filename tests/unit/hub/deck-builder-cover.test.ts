import { describe, it, expect } from 'vitest';
import {
  deckCoverImageUrl,
  deckCoverImageUrlSecondary,
  pickCoverPartnerStatus,
  pickDeckCoverCards,
  type CardInstance,
  type DeckDocument,
} from '@rayenz-hub/shared';

function card(
  over: Partial<CardInstance> & Pick<CardInstance, 'name' | 'instanceId' | 'primaryCategory'>,
): CardInstance {
  return {
    quantity: 1,
    categories: [over.primaryCategory],
    stack: null,
    setCode: 'c16',
    collectorNumber: '1',
    scryfallId: over.instanceId,
    colourIdentity: ['G'],
    typeLine: 'Legendary Creature',
    layout: 'normal',
    keywords: null,
    partnerWith: null,
    archidektCardId: null,
    foil: false,
    ...over,
  };
}

function doc(cards: CardInstance[], format: DeckDocument['format'] = 'commander'): DeckDocument {
  return {
    schemaVersion: 1,
    deckId: 'd1',
    name: 'Test',
    format,
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards,
    formalSwapEntries: [],
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
  };
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
    expect(deckCoverImageUrl(d)).toContain('a');
    expect(deckCoverImageUrlSecondary(d)).toContain('b');
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
});
