import { describe, it, expect } from 'vitest';
import {
  enrichAttemptSignature,
  isUsableOracleCache,
  materialOraclePatch,
  needsEnrich,
} from '../../../packages/web/src/deck-builder/scryfall/useScryfallEnrich.ts';

describe('isUsableOracleCache', () => {
  it('rejects cache entries missing typeLine when the card also lacks typeLine', () => {
    expect(
      isUsableOracleCache(
        { colourIdentity: ['W', 'U'], typeLine: null, scryfallId: 'x', layout: 'normal' },
        { typeLine: null, layout: null },
      ),
    ).toBe(false);
  });

  it('rejects cache missing layout when the card needs layout', () => {
    expect(
      isUsableOracleCache(
        { colourIdentity: ['W'], typeLine: 'Instant', scryfallId: 'x', layout: null },
        { typeLine: 'Instant', layout: null },
      ),
    ).toBe(false);
  });

  it('accepts cache with typeLine when the card needs it', () => {
    expect(
      isUsableOracleCache(
        {
          colourIdentity: ['W', 'U'],
          typeLine: 'Land — Plains Island',
          scryfallId: 'x',
          layout: 'normal',
        },
        { typeLine: null, layout: null },
      ),
    ).toBe(true);
  });

  it('accepts incomplete typeLine cache when the card already has a typeLine and layout', () => {
    expect(
      isUsableOracleCache(
        { colourIdentity: ['W'], typeLine: null, scryfallId: 'x', layout: 'normal' },
        { typeLine: 'Instant', layout: 'normal' },
      ),
    ).toBe(true);
  });
});

describe('enrichAttemptSignature', () => {
  it('is stable for the same missing instance ids', () => {
    const cards = [
      { instanceId: 'b', colourIdentity: ['W', 'U'], typeLine: null, layout: null },
      { instanceId: 'a', colourIdentity: [], typeLine: null, layout: null },
    ];
    expect(enrichAttemptSignature('deck-1', cards)).toBe(
      enrichAttemptSignature('deck-1', [...cards].reverse()),
    );
    expect(enrichAttemptSignature('deck-1', cards)).toBe('deck-1:a,b');
  });

  it('changes when a card no longer needs enrich', () => {
    const before = [
      { instanceId: 'a', colourIdentity: ['W', 'U'], typeLine: null, layout: null },
      {
        instanceId: 'b',
        colourIdentity: ['G'],
        typeLine: 'Creature',
        layout: 'normal',
      },
    ];
    const after = [
      {
        instanceId: 'a',
        colourIdentity: ['W', 'U'],
        typeLine: 'Land — Plains Island',
        layout: 'normal',
      },
      {
        instanceId: 'b',
        colourIdentity: ['G'],
        typeLine: 'Creature',
        layout: 'normal',
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
        { colourIdentity: ['W', 'U'], typeLine: null, scryfallId: null, layout: null },
        { colourIdentity: ['W', 'U'], typeLine: null, scryfallId: 'x', layout: 'normal' },
      ),
    ).toBeNull();
  });

  it('patches typeLine when newly available', () => {
    expect(
      materialOraclePatch(
        { colourIdentity: ['W', 'U'], typeLine: null, scryfallId: null, layout: null },
        {
          colourIdentity: ['W', 'U'],
          typeLine: 'Land — Plains Island',
          scryfallId: 'x',
          layout: 'normal',
        },
      ),
    ).toEqual({
      typeLine: 'Land — Plains Island',
      scryfallId: 'x',
      layout: 'normal',
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
        },
        {
          colourIdentity: ['W'],
          typeLine: 'Instant',
          scryfallId: 'x',
          layout: 'transform',
        },
      ),
    ).toEqual({ layout: 'transform' });
  });

  it('returns null when nothing improves', () => {
    expect(
      materialOraclePatch(
        {
          colourIdentity: ['W'],
          typeLine: 'Instant',
          scryfallId: 'x',
          layout: 'normal',
        },
        {
          colourIdentity: ['W'],
          typeLine: 'Instant',
          scryfallId: 'x',
          layout: 'normal',
        },
      ),
    ).toBeNull();
  });
});

describe('needsEnrich', () => {
  it('is true when typeLine is missing', () => {
    expect(needsEnrich({ colourIdentity: ['W'], typeLine: null, layout: 'normal' })).toBe(
      true,
    );
  });

  it('is true when layout is missing', () => {
    expect(needsEnrich({ colourIdentity: ['W'], typeLine: 'Instant', layout: null })).toBe(
      true,
    );
  });

  it('is false when CI, typeLine, and layout are present', () => {
    expect(
      needsEnrich({ colourIdentity: ['W'], typeLine: 'Instant', layout: 'normal' }),
    ).toBe(false);
  });
});
