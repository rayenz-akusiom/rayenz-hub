import { describe, expect, it } from 'vitest';
import {
  cardHasBackFace,
  cardImageUrl,
  scryfallImageFromId,
  scryfallImageFromName,
  scryfallImageFromPrinting,
} from '../../../packages/shared/src/deck-builder/scryfall-images.ts';

describe('cardHasBackFace', () => {
  it('is true for dual-faced layouts', () => {
    expect(cardHasBackFace('transform')).toBe(true);
    expect(cardHasBackFace('modal_dfc')).toBe(true);
    expect(cardHasBackFace('double_faced_token')).toBe(true);
    expect(cardHasBackFace('art_series')).toBe(true);
    expect(cardHasBackFace('reversible_card')).toBe(true);
    expect(cardHasBackFace('TRANSFORM')).toBe(true);
  });

  it('is false for single-faced and unknown layouts', () => {
    expect(cardHasBackFace('normal')).toBe(false);
    expect(cardHasBackFace('adventure')).toBe(false);
    expect(cardHasBackFace('split')).toBe(false);
    expect(cardHasBackFace('flip')).toBe(false);
    expect(cardHasBackFace(null)).toBe(false);
    expect(cardHasBackFace(undefined)).toBe(false);
    expect(cardHasBackFace('')).toBe(false);
  });
});

describe('scryfall image face param', () => {
  it('appends face=back for id urls', () => {
    expect(scryfallImageFromId('abc-123', 'back')).toBe(
      'https://api.scryfall.com/cards/abc-123?format=image&version=normal&face=back',
    );
    expect(scryfallImageFromId('abc-123')).toBe(
      'https://api.scryfall.com/cards/abc-123?format=image&version=normal',
    );
  });

  it('appends face=back for printing and name urls', () => {
    expect(scryfallImageFromPrinting('CMM', '1', 'back')).toBe(
      'https://api.scryfall.com/cards/cmm/1?format=image&version=normal&face=back',
    );
    expect(scryfallImageFromName('Delver of Secrets', 'back')).toBe(
      'https://api.scryfall.com/cards/named?exact=Delver%20of%20Secrets&format=image&version=normal&face=back',
    );
  });

  it('cardImageUrl respects face', () => {
    expect(
      cardImageUrl(
        { scryfallId: 'abc', name: 'X', setCode: null, collectorNumber: null },
        'back',
      ),
    ).toContain('face=back');
  });
});
