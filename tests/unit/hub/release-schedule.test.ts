import { describe, expect, it } from 'vitest';
import {
  documentFromMtgjsonDeck,
  emptyReleaseScheduleDocument,
  filterCommanderDecksForSet,
  isReleaseScheduleSetDue,
  listDueReleaseScheduleSets,
  mergeReleaseScheduleSets,
  ReleaseScheduleDocumentSchema,
  ReleaseSchedulePutSchema,
} from '../../../packages/shared/src/index.ts';

describe('release schedule due logic', () => {
  const base = {
    setCode: 'TLA',
    finalRevealDate: '2026-01-01',
    expectedCommanderDecks: 4,
  };

  it('is due after reveal when work remains', () => {
    expect(
      isReleaseScheduleSetDue(base, new Date('2026-01-02T12:00:00Z')),
    ).toBe(true);
    expect(
      isReleaseScheduleSetDue(base, new Date('2025-12-31T12:00:00Z')),
    ).toBe(false);
  });

  it('is not due when precon and pool are complete', () => {
    expect(
      isReleaseScheduleSetDue(
        {
          ...base,
          preconStatus: 'complete',
          loadedCommanderDecks: 4,
          setPoolStatus: 'ready',
        },
        new Date('2026-02-01T00:00:00Z'),
      ),
    ).toBe(false);
  });

  it('lists due sets from a document', () => {
    const doc = ReleaseScheduleDocumentSchema.parse({
      version: 1,
      updatedAt: new Date().toISOString(),
      sets: [
        base,
        {
          setCode: 'EOE',
          finalRevealDate: '2099-01-01',
          expectedCommanderDecks: 2,
        },
      ],
    });
    expect(listDueReleaseScheduleSets(doc, new Date('2026-06-01Z')).map((s) => s.setCode)).toEqual([
      'TLA',
    ]);
  });

  it('merges worker fields on PUT', () => {
    const merged = mergeReleaseScheduleSets(
      [{ setCode: 'tla', finalRevealDate: '2026-01-01', expectedCommanderDecks: 5, name: 'Avatar' }],
      [
        {
          setCode: 'TLA',
          finalRevealDate: '2026-01-01',
          expectedCommanderDecks: 4,
          loadedCommanderDecks: 2,
          preconStatus: 'partial',
          setPoolStatus: 'ready',
          lastEnsuredAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    );
    expect(merged[0]).toMatchObject({
      setCode: 'TLA',
      expectedCommanderDecks: 5,
      name: 'Avatar',
      loadedCommanderDecks: 2,
      preconStatus: 'partial',
      setPoolStatus: 'ready',
    });
  });

  it('empty document parses', () => {
    expect(emptyReleaseScheduleDocument().sets).toEqual([]);
    expect(ReleaseSchedulePutSchema.parse({ sets: [] }).sets).toEqual([]);
  });
});

describe('mtgjson precon mapper', () => {
  it('builds a public commander deck document', () => {
    const { document, missingPrintings } = documentFromMtgjsonDeck(
      {
        code: 'TLA',
        name: 'Test Precon',
        commander: [
          {
            name: 'Aang',
            count: 1,
            setCode: 'TLA',
            number: '1',
            types: ['Creature'],
            colorIdentity: ['W'],
            identifiers: { scryfallId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          },
        ],
        mainBoard: [
          {
            name: 'Plains',
            count: 10,
            setCode: 'TLA',
            number: '250',
            types: ['Land'],
            colorIdentity: ['W'],
            identifiers: { scryfallId: '11111111-2222-3333-4444-555555555555' },
          },
        ],
      },
      {
        deckId: 'precon-TLA_Test',
        name: 'Test Precon',
        fileName: 'TLA_Test',
        code: 'TLA',
        releaseDate: '2026-01-01',
        now: '2026-01-01T00:00:00.000Z',
        nextId: (p) => `${p}-fixed`,
      },
    );
    expect(missingPrintings).toBe(0);
    expect(document.visibility).toBe('public');
    expect(document.format).toBe('commander');
    expect(document.cards.some((c) => c.primaryCategory === 'Commander')).toBe(true);
    expect(document.cards.some((c) => c.primaryCategory === 'Land')).toBe(true);
  });

  it('filters commander decks by set code', () => {
    const rows = filterCommanderDecksForSet(
      [
        {
          code: 'TLA',
          fileName: 'TLA_A',
          name: 'A',
          releaseDate: null,
          type: 'Commander Deck',
        },
        {
          code: 'EOE',
          fileName: 'EOE_A',
          name: 'B',
          releaseDate: null,
          type: 'Commander Deck',
        },
        {
          code: 'TLA',
          fileName: 'TLA_Bundle',
          name: 'Bundle',
          releaseDate: null,
          type: 'Deck',
        },
      ],
      'tla',
    );
    expect(rows.map((r) => r.fileName)).toEqual(['TLA_A']);
  });
});
