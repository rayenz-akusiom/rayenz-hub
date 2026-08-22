import { describe, expect, it } from 'vitest';
import {
  DeckDocumentSchema,
  deckOwnership,
  deckVisibility,
  filterLibraryByFormat,
  isPrivateDeck,
  isTheoryDeck,
  partitionLibraryByOwnership,
  toDeckSummary,
  type DeckSummary,
} from '../../../packages/shared/src/index.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

describe('deck ownership', () => {
  it('defaults missing ownership to owned on parse and summary', () => {
    const raw = { ...commander };
    delete (raw as { ownership?: string }).ownership;
    const doc = DeckDocumentSchema.parse(raw);
    expect(doc.ownership).toBe('owned');
    expect(toDeckSummary(doc).ownership).toBe('owned');
    expect(isTheoryDeck(doc)).toBe(false);
    expect(deckOwnership(undefined)).toBe('owned');
  });

  it('preserves theory on document and summary', () => {
    const doc = DeckDocumentSchema.parse({ ...commander, ownership: 'theory' });
    expect(doc.ownership).toBe('theory');
    expect(toDeckSummary(doc).ownership).toBe('theory');
    expect(isTheoryDeck(doc)).toBe(true);
  });

  it('partitions library Owned then Theory', () => {
    const summaries: DeckSummary[] = [
      {
        deckId: 't1',
        name: 'Theory A',
        format: 'commander',
        ownership: 'theory',
        updatedAt: '2026-01-02T00:00:00.000Z',
        archidektId: null,
      },
      {
        deckId: 'o1',
        name: 'Owned A',
        format: 'commander',
        ownership: 'owned',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archidektId: null,
      },
      {
        deckId: 'o2',
        name: 'Owned B',
        format: 'commander',
        updatedAt: '2026-01-03T00:00:00.000Z',
        archidektId: null,
      },
    ];
    const { owned, theory } = partitionLibraryByOwnership(summaries);
    expect(owned.map((d) => d.deckId)).toEqual(['o1', 'o2']);
    expect(theory.map((d) => d.deckId)).toEqual(['t1']);
  });

  it('filterLibraryByFormat keeps only the requested format', () => {
    const summaries: DeckSummary[] = [
      {
        deckId: 'c1',
        name: 'Commander A',
        format: 'commander',
        ownership: 'owned',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archidektId: null,
      },
      {
        deckId: 'u1',
        name: 'Cube A',
        format: 'cube',
        ownership: 'owned',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archidektId: null,
      },
      {
        deckId: 'o1',
        name: 'Other',
        format: 'other',
        ownership: 'owned',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archidektId: null,
      },
      {
        deckId: 'c2',
        name: 'Commander B',
        format: 'commander',
        ownership: 'owned',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archidektId: null,
      },
      {
        deckId: 'p1',
        name: 'Pendragon A',
        format: 'pendragon',
        ownership: 'owned',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archidektId: null,
      },
    ];
    expect(filterLibraryByFormat(summaries, 'commander').map((d) => d.deckId)).toEqual([
      'c1',
      'c2',
      'p1',
    ]);
    expect(filterLibraryByFormat(summaries, 'cube').map((d) => d.name)).toEqual(['Cube A']);
    expect(filterLibraryByFormat([summaries[2]!], 'commander')).toEqual([]);
  });
});

describe('deck visibility', () => {
  it('defaults missing visibility to public on parse and summary', () => {
    const raw = { ...commander };
    delete (raw as { visibility?: string }).visibility;
    const doc = DeckDocumentSchema.parse(raw);
    expect(doc.visibility).toBe('public');
    expect(toDeckSummary(doc).visibility).toBe('public');
    expect(isPrivateDeck(doc)).toBe(false);
    expect(deckVisibility(undefined)).toBe('public');
  });

  it('preserves private on document and summary', () => {
    const doc = DeckDocumentSchema.parse({ ...commander, visibility: 'private' });
    expect(doc.visibility).toBe('private');
    expect(toDeckSummary(doc).visibility).toBe('private');
    expect(isPrivateDeck(doc)).toBe(true);
  });
});
