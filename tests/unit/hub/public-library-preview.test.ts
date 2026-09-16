import { describe, expect, it } from 'vitest';
import { previewDecksPerFormat, type DeckSummary } from '@rayenz-hub/shared';

function summary(over: Partial<DeckSummary> & Pick<DeckSummary, 'deckId' | 'name'>): DeckSummary {
  return {
    format: 'commander',
    ownership: 'owned',
    visibility: 'public',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archidektId: null,
    coverImageUrl: null,
    coverImageUrlSecondary: null,
    coverPartnerStatus: null,
    coverCardName: null,
    ...over,
  };
}

describe('previewDecksPerFormat', () => {
  it('keeps the N most recent decks in each format', () => {
    const decks = [
      summary({ deckId: 'c1', name: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      summary({ deckId: 'c2', name: 'Mid', updatedAt: '2026-01-02T00:00:00.000Z' }),
      summary({ deckId: 'c3', name: 'New', updatedAt: '2026-01-03T00:00:00.000Z' }),
      summary({
        deckId: 'u1',
        name: 'Cube A',
        format: 'cube',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      summary({
        deckId: 'u2',
        name: 'Cube B',
        format: 'cube',
        updatedAt: '2026-02-01T00:00:00.000Z',
      }),
    ];
    const preview = previewDecksPerFormat(decks, 2);
    expect(preview.map((d) => d.deckId)).toEqual(['c3', 'c2', 'u2', 'u1']);
  });
});
