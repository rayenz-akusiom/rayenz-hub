import { describe, expect, it } from 'vitest';
import { filterLibraryByFormat } from '../../../packages/shared/src/deck-builder/library-filter.ts';
import type { DeckSummary } from '../../../packages/shared/src/schemas/deck-builder.ts';

function summary(name: string, format: DeckSummary['format']): DeckSummary {
  return {
    deckId: `${name}-id`,
    name,
    format,
    updatedAt: '2026-01-01T00:00:00.000Z',
    archidektId: null,
    coverImageUrl: null,
    coverImageUrlSecondary: null,
    coverPartnerStatus: null,
    coverCardName: null,
  };
}

describe('filterLibraryByFormat', () => {
  const decks = [
    summary('Commander A', 'commander'),
    summary('Cube A', 'cube'),
    summary('Other', 'other'),
    summary('Commander B', 'commander'),
  ];

  it('returns only commander decks', () => {
    const filtered = filterLibraryByFormat(decks, 'commander');
    expect(filtered).toHaveLength(2);
    expect(filtered.every((d) => d.format === 'commander')).toBe(true);
  });

  it('returns only cube decks', () => {
    const filtered = filterLibraryByFormat(decks, 'cube');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Cube A');
  });

  it('returns empty array when no matches', () => {
    expect(filterLibraryByFormat([summary('Other', 'other')], 'commander')).toEqual([]);
  });
});
