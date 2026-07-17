import { describe, expect, it } from 'vitest';
import {
  cardHasBackFace,
  cardImageUrl,
  provisionalLayoutFromCard,
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

describe('provisionalLayoutFromCard', () => {
  it('defaults to normal', () => {
    expect(provisionalLayoutFromCard('Lightning Bolt', 'Instant')).toBe('normal');
    expect(provisionalLayoutFromCard('Sol Ring', null)).toBe('normal');
  });

  it('uses transform when name or type line looks dual-faced', () => {
    expect(provisionalLayoutFromCard('Delver of Secrets // Insectile Aberration', null)).toBe(
      'transform',
    );
    expect(
      provisionalLayoutFromCard(
        'Delver of Secrets',
        'Creature — Human Wizard // Creature — Human Insect',
      ),
    ).toBe('transform');
  });
});

describe('scryfall image urls', () => {
  it('builds CDN urls from scryfall id (front and back)', () => {
    expect(scryfallImageFromId('abc-123', 'back')).toBe(
      'https://cards.scryfall.io/normal/back/a/b/abc-123.jpg',
    );
    expect(scryfallImageFromId('abc-123')).toBe(
      'https://cards.scryfall.io/normal/front/a/b/abc-123.jpg',
    );
    expect(scryfallImageFromId('91fdb56b-54d5-4272-8319-505ff987fe9b')).toBe(
      'https://cards.scryfall.io/normal/front/9/1/91fdb56b-54d5-4272-8319-505ff987fe9b.jpg',
    );
  });

  it('appends face=back for printing and name api urls', () => {
    expect(scryfallImageFromPrinting('CMM', '1', 'back')).toBe(
      'https://api.scryfall.com/cards/cmm/1?format=image&version=normal&face=back',
    );
    expect(scryfallImageFromName('Delver of Secrets', 'back')).toBe(
      'https://api.scryfall.com/cards/named?exact=Delver%20of%20Secrets&format=image&version=normal&face=back',
    );
  });

  it('cardImageUrl prefers CDN id urls', () => {
    expect(
      cardImageUrl(
        { scryfallId: 'abc', name: 'X', setCode: null, collectorNumber: null },
        'back',
      ),
    ).toBe('https://cards.scryfall.io/normal/back/a/b/abc.jpg');
  });
});
