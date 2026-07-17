import { describe, it, expect } from 'vitest';
import {
  enrichAttemptSignature,
  isUsableOracleCache,
  materialOraclePatch,
  needsEnrich,
  parseOracleJson,
  type ScryfallOracleCache,
} from '../../../packages/web/src/deck-builder/scryfall/useScryfallEnrich.ts';

const baseCache = (over: Partial<ScryfallOracleCache> = {}): ScryfallOracleCache => ({
  colourIdentity: ['W'],
  typeLine: 'Instant',
  scryfallId: 'x',
  layout: 'normal',
  keywords: [],
  partnerWith: null,
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

  it('rejects cache missing layout when the card needs layout', () => {
    expect(
      isUsableOracleCache(baseCache({ layout: null }), {
        typeLine: 'Instant',
        layout: null,
        keywords: null,
        primaryCategory: 'Other',
      }),
    ).toBe(false);
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
    const cards = [
      {
        instanceId: 'b',
        colourIdentity: ['W', 'U'] as ('W' | 'U' | 'B' | 'R' | 'G')[],
        typeLine: null,
        layout: null,
        keywords: null,
        primaryCategory: 'Other',
      },
      {
        instanceId: 'a',
        colourIdentity: [] as ('W' | 'U' | 'B' | 'R' | 'G')[],
        typeLine: null,
        layout: null,
        keywords: null,
        primaryCategory: 'Other',
      },
    ];
    expect(enrichAttemptSignature('deck-1', cards)).toBe(
      enrichAttemptSignature('deck-1', [...cards].reverse()),
    );
    expect(enrichAttemptSignature('deck-1', cards)).toBe('deck-1:a,b');
  });

  it('changes when a card no longer needs enrich', () => {
    const before = [
      {
        instanceId: 'a',
        colourIdentity: ['W', 'U'] as ('W' | 'U' | 'B' | 'R' | 'G')[],
        typeLine: null,
        layout: null,
        keywords: null,
        primaryCategory: 'Other',
      },
      {
        instanceId: 'b',
        colourIdentity: ['G'] as ('W' | 'U' | 'B' | 'R' | 'G')[],
        typeLine: 'Creature',
        layout: 'normal',
        keywords: null,
        primaryCategory: 'Other',
      },
    ];
    const after = [
      {
        instanceId: 'a',
        colourIdentity: ['W', 'U'] as ('W' | 'U' | 'B' | 'R' | 'G')[],
        typeLine: 'Land — Plains Island',
        layout: 'normal',
        keywords: null,
        primaryCategory: 'Other',
      },
      {
        instanceId: 'b',
        colourIdentity: ['G'] as ('W' | 'U' | 'B' | 'R' | 'G')[],
        typeLine: 'Creature',
        layout: 'normal',
        keywords: null,
        primaryCategory: 'Other',
      },
    ];
    expect(enrichAttemptSignature('deck-1', before)).toBe('deck-1:a');
    expect(enrichAttemptSignature('deck-1', after)).toBe('deck-1:');
    expect(enrichAttemptSignature('deck-1', before)).not.toBe(
      enrichAttemptSignature('deck-1', after),
    );
  });
});

describe('materialOraclePatch', () => {
  it('returns null when oracle has no typeLine and the card still needs one', () => {
    expect(
      materialOraclePatch(
        {
          colourIdentity: ['W', 'U'],
          typeLine: null,
          scryfallId: null,
          layout: null,
          keywords: null,
          partnerWith: null,
          primaryCategory: 'Other',
        },
        baseCache({ colourIdentity: ['W', 'U'], typeLine: null }),
      ),
    ).toBeNull();
  });

  it('patches typeLine when newly available', () => {
    expect(
      materialOraclePatch(
        {
          colourIdentity: ['W', 'U'],
          typeLine: null,
          scryfallId: null,
          layout: null,
          keywords: null,
          partnerWith: null,
          primaryCategory: 'Other',
        },
        baseCache({
          colourIdentity: ['W', 'U'],
          typeLine: 'Land — Plains Island',
        }),
      ),
    ).toEqual({
      typeLine: 'Land — Plains Island',
      scryfallId: 'x',
      layout: 'normal',
      keywords: [],
      partnerWith: null,
    });
  });

  it('patches layout when missing', () => {
    expect(
      materialOraclePatch(
        {
          colourIdentity: ['W'],
          typeLine: 'Instant',
          scryfallId: 'x',
          layout: null,
          keywords: [],
          partnerWith: null,
          primaryCategory: 'Other',
        },
        baseCache({ layout: 'transform' }),
      ),
    ).toEqual({ layout: 'transform' });
  });

  it('patches keywords and partnerWith for leaders', () => {
    expect(
      materialOraclePatch(
        {
          colourIdentity: ['G'],
          typeLine: 'Legendary Creature',
          scryfallId: 'x',
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          primaryCategory: 'Commander',
        },
        baseCache({
          typeLine: 'Legendary Creature',
          colourIdentity: ['G'],
          keywords: ['Partner with'],
          partnerWith: 'Alena, Kessig Trapper',
        }),
      ),
    ).toEqual({
      keywords: ['Partner with'],
      partnerWith: 'Alena, Kessig Trapper',
    });
  });

  it('returns null when nothing improves', () => {
    expect(
      materialOraclePatch(
        {
          colourIdentity: ['W'],
          typeLine: 'Instant',
          scryfallId: 'x',
          layout: 'normal',
          keywords: [],
          partnerWith: null,
          primaryCategory: 'Other',
        },
        baseCache(),
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

  it('is true when layout is missing', () => {
    expect(
      needsEnrich({
        colourIdentity: ['W'],
        typeLine: 'Instant',
        layout: null,
        keywords: null,
        primaryCategory: 'Other',
      }),
    ).toBe(true);
  });

  it('is false when CI, typeLine, and layout are present for non-leaders', () => {
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
    });
  });
});
