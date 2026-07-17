import { describe, it, expect } from 'vitest';
import {
  enrichAttemptSignature,
  isUsableOracleCache,
  materialOraclePatch,
  needsEnrich,
  parseOracleJson,
  type ScryfallOracleCache,
} from '../../../packages/web/src/deck-builder/scryfall/useScryfallEnrich.ts';
import type { CardInstance, CardOracle } from '@rayenz-hub/shared';
import { oracleKey } from '@rayenz-hub/shared';

const baseCache = (over: Partial<ScryfallOracleCache> = {}): ScryfallOracleCache => ({
  colourIdentity: ['W'],
  typeLine: 'Instant',
  scryfallId: 'x',
  layout: 'normal',
  keywords: [],
  partnerWith: null,
  ...over,
});

const leanCard = (
  over: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'primaryCategory'>,
): CardInstance => ({
  name: 'Card',
  quantity: 1,
  categories: [over.primaryCategory],
  stack: null,
  setCode: null,
  collectorNumber: null,
  scryfallId: null,
  archidektCardId: null,
  foil: false,
  ...over,
});

const completeOracle = (over: Partial<CardOracle> = {}): CardOracle => ({
  scryfallId: null,
  colourIdentity: ['W', 'U'],
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
  ...over,
});

describe('isUsableOracleCache', () => {
  it('rejects cache entries missing typeLine when the card also lacks typeLine', () => {
    expect(
      isUsableOracleCache(
        baseCache({ colourIdentity: ['W', 'U'], typeLine: null }),
        { typeLine: null, layout: null, keywords: null, primaryCategory: 'Other' },
      ),
    ).toBe(false);
  });

  it('accepts cache with typeLine when the card needs it even if layout is null', () => {
    expect(
      isUsableOracleCache(baseCache({ layout: null }), {
        typeLine: 'Instant',
        layout: null,
        keywords: null,
        primaryCategory: 'Other',
      }),
    ).toBe(true);
  });

  it('accepts cache with typeLine when the card needs it', () => {
    expect(
      isUsableOracleCache(
        baseCache({
          colourIdentity: ['W', 'U'],
          typeLine: 'Land — Plains Island',
        }),
        { typeLine: null, layout: null, keywords: null, primaryCategory: 'Other' },
      ),
    ).toBe(true);
  });

  it('accepts incomplete typeLine cache when the card already has a typeLine and layout', () => {
    expect(
      isUsableOracleCache(baseCache({ typeLine: null }), {
        typeLine: 'Instant',
        layout: 'normal',
        keywords: null,
        primaryCategory: 'Other',
      }),
    ).toBe(true);
  });

  it('rejects cache without keywords array when a leader still needs keywords', () => {
    expect(
      isUsableOracleCache(
        {
          colourIdentity: ['G'],
          typeLine: 'Legendary Creature',
          scryfallId: 'x',
          layout: 'normal',
          keywords: undefined as unknown as string[],
          partnerWith: null,
        },
        {
          typeLine: 'Legendary Creature',
          layout: 'normal',
          keywords: null,
          primaryCategory: 'Commander',
        },
      ),
    ).toBe(false);
  });

  it('accepts cache with keywords for a leader missing keywords', () => {
    expect(
      isUsableOracleCache(baseCache({ keywords: ['Partner'], typeLine: 'Legendary Creature' }), {
        typeLine: 'Legendary Creature',
        layout: 'normal',
        keywords: null,
        primaryCategory: 'Commander',
      }),
    ).toBe(true);
  });
});

describe('enrichAttemptSignature', () => {
  it('is stable for the same missing instance ids', () => {
    const cardA = leanCard({
      instanceId: 'b',
      name: 'Needs type',
      primaryCategory: 'Other',
    });
    const cardB = leanCard({
      instanceId: 'a',
      name: 'Complete',
      primaryCategory: 'Other',
    });
    const cards = [cardA, cardB];
    const oracle: Record<string, CardOracle> = {
      [oracleKey(cardA)]: completeOracle({ typeLine: null }),
      [oracleKey(cardB)]: completeOracle(),
    };
    expect(enrichAttemptSignature('deck-1', cards, oracle)).toBe(
      enrichAttemptSignature('deck-1', [...cards].reverse(), oracle),
    );
    expect(enrichAttemptSignature('deck-1', cards, oracle)).toBe('deck-1:b');
  });

  it('changes when a card no longer needs enrich', () => {
    const cardA = leanCard({ instanceId: 'a', name: 'A', primaryCategory: 'Other' });
    const cardB = leanCard({ instanceId: 'b', name: 'B', primaryCategory: 'Other' });
    const cards = [cardA, cardB];
    const beforeOracle: Record<string, CardOracle> = {
      [oracleKey(cardA)]: completeOracle({ typeLine: null }),
      [oracleKey(cardB)]: completeOracle({ colourIdentity: ['G'], typeLine: 'Creature' }),
    };
    const afterOracle: Record<string, CardOracle> = {
      [oracleKey(cardA)]: completeOracle({ typeLine: 'Land — Plains Island' }),
      [oracleKey(cardB)]: completeOracle({ colourIdentity: ['G'], typeLine: 'Creature' }),
    };
    expect(enrichAttemptSignature('deck-1', cards, beforeOracle)).toBe('deck-1:a');
    expect(enrichAttemptSignature('deck-1', cards, afterOracle)).toBe('deck-1:');
    expect(enrichAttemptSignature('deck-1', cards, beforeOracle)).not.toBe(
      enrichAttemptSignature('deck-1', cards, afterOracle),
    );
  });
});

describe('materialOraclePatch', () => {
  it('returns null when scryfallId is already set on the card', () => {
    expect(
      materialOraclePatch(
        {
          scryfallId: 'existing',
          primaryCategory: 'Other',
        },
        baseCache({ scryfallId: 'x' }),
      ),
    ).toBeNull();
  });

  it('patches scryfallId when newly available from cache', () => {
    expect(
      materialOraclePatch(
        {
          scryfallId: null,
          primaryCategory: 'Other',
        },
        baseCache({ scryfallId: 'x' }),
      ),
    ).toEqual({ scryfallId: 'x' });
  });

  it('returns null when cache has no scryfallId to add', () => {
    expect(
      materialOraclePatch(
        {
          scryfallId: null,
          primaryCategory: 'Other',
        },
        baseCache({ scryfallId: null }),
      ),
    ).toBeNull();
  });
});

describe('needsEnrich', () => {
  it('is true when typeLine is missing', () => {
    expect(
      needsEnrich({
        colourIdentity: ['W'],
        typeLine: null,
        layout: 'normal',
        keywords: null,
        primaryCategory: 'Other',
      }),
    ).toBe(true);
  });

  it('is false when only layout is missing (layout is not an enrich trigger)', () => {
    expect(
      needsEnrich({
        colourIdentity: ['W'],
        typeLine: 'Instant',
        layout: null,
        keywords: null,
        primaryCategory: 'Other',
      }),
    ).toBe(false);
  });

  it('is false when CI and typeLine are present for non-leaders', () => {
    expect(
      needsEnrich({
        colourIdentity: ['W'],
        typeLine: 'Instant',
        layout: 'normal',
        keywords: null,
        primaryCategory: 'Other',
      }),
    ).toBe(false);
  });

  it('is true for commanders missing keywords even when other fields exist', () => {
    expect(
      needsEnrich({
        colourIdentity: ['G'],
        typeLine: 'Legendary Creature',
        layout: 'normal',
        keywords: null,
        primaryCategory: 'Commander',
      }),
    ).toBe(true);
  });

  it('is false for commanders that already have keywords', () => {
    expect(
      needsEnrich({
        colourIdentity: ['G'],
        typeLine: 'Legendary Creature',
        layout: 'normal',
        keywords: ['Partner'],
        primaryCategory: 'Commander',
      }),
    ).toBe(false);
  });
});

describe('parseOracleJson', () => {
  it('parses Partner with from oracle text', () => {
    expect(
      parseOracleJson({
        id: 'abc',
        type_line: 'Legendary Creature — Human Ranger',
        color_identity: ['G', 'R'],
        layout: 'normal',
        keywords: ['Partner with'],
        oracle_text:
          'Partner with Alena, Kessig Trapper (When this creature enters, target player may put Alena into their hand from their library, then shuffle.)\nReach',
      }),
    ).toEqual({
      scryfallId: 'abc',
      typeLine: 'Legendary Creature — Human Ranger',
      colourIdentity: ['G', 'R'],
      layout: 'normal',
      keywords: ['Partner with'],
      partnerWith: 'Alena, Kessig Trapper',
      oracleText:
        'Partner with Alena, Kessig Trapper (When this creature enters, target player may put Alena into their hand from their library, then shuffle.)\nReach',
      imageUrl: 'https://cards.scryfall.io/normal/front/a/b/abc.jpg',
    });
  });
});
