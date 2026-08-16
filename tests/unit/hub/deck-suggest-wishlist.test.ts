import { describe, expect, it } from 'vitest';
import { buildSessionWishlistText } from '../../../packages/web/src/deck-suggest/wishlist-export.ts';

describe('session wishlist export', () => {
  it('combines quantities and omits empty sessions', () => {
    expect(buildSessionWishlistText([])).toBe('');
    const text = buildSessionWishlistText([
      { deckId: 'a', cardName: 'Sol Ring', quantity: 1, kind: 'queued_in' },
      { deckId: 'b', cardName: 'Sol Ring', quantity: 1, kind: 'seeking' },
    ]);
    expect(text.toLowerCase()).toContain('sol ring');
  });
});
