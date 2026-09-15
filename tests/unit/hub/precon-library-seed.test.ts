import { describe, expect, it } from 'vitest';
import { isUnlimitedLibraryUsername, PRECONS_USERNAME } from '@rayenz-hub/shared';
import {
  categoryFromMtgjsonCard,
  documentFromMtgjsonDeck,
} from '../../../scripts/seed-precon-library.ts';

describe('isUnlimitedLibraryUsername', () => {
  it('matches only the precons catalog account', () => {
    expect(isUnlimitedLibraryUsername(PRECONS_USERNAME)).toBe(true);
    expect(isUnlimitedLibraryUsername('Precons')).toBe(true);
    expect(isUnlimitedLibraryUsername('rayenz')).toBe(false);
    expect(isUnlimitedLibraryUsername(null)).toBe(false);
  });
});

describe('seed-precon-library mapping', () => {
  it('categorizes MTGJSON types for browse', () => {
    expect(categoryFromMtgjsonCard({ types: ['Creature'], type: 'Creature — Human' })).toBe(
      'Creature',
    );
    expect(categoryFromMtgjsonCard({ types: ['Land'], type: 'Basic Land — Forest' })).toBe('Land');
    expect(categoryFromMtgjsonCard({ types: ['Instant'], type: 'Instant' })).toBe('Instant');
  });

  it('builds a Hub deck with commander printing fields', () => {
    const { document, missingPrintings } = documentFromMtgjsonDeck(
      {
        code: 'C16',
        name: 'Breed Lethality',
        releaseDate: '2016-11-11',
        commander: [
          {
            name: 'Atraxa, Praetors\' Voice',
            count: 1,
            setCode: 'C16',
            number: '28',
            isFoil: true,
            type: 'Legendary Creature — Phyrexian Angel Horror',
            types: ['Creature'],
            colorIdentity: ['W', 'U', 'B', 'G'],
            identifiers: { scryfallId: 'aea599da-5bfb-458b-8e05-aade08df0a7e' },
          },
        ],
        mainBoard: [
          {
            name: 'Sol Ring',
            count: 1,
            setCode: 'C16',
            number: '267',
            type: 'Artifact',
            types: ['Artifact'],
            colorIdentity: [],
            identifiers: { scryfallId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          },
          {
            name: 'Forest',
            count: 5,
            setCode: 'C16',
            number: '349',
            type: 'Basic Land — Forest',
            types: ['Land'],
            colorIdentity: ['G'],
            identifiers: { scryfallId: '11111111-2222-3333-4444-555555555555' },
          },
        ],
      },
      {
        deckId: 'precon-BreedLethality_C16',
        name: 'Breed Lethality',
        fileName: 'BreedLethality_C16',
        code: 'C16',
        releaseDate: '2016-11-11',
      },
    );

    expect(missingPrintings).toBe(0);
    expect(document.format).toBe('commander');
    expect(document.visibility).toBe('public');
    expect(document.cards.filter((c) => c.primaryCategory === 'Commander')).toHaveLength(1);
    const atraxa = document.cards.find((c) => c.name.startsWith('Atraxa'));
    expect(atraxa?.setCode).toBe('c16');
    expect(atraxa?.collectorNumber).toBe('28');
    expect(atraxa?.scryfallId).toBe('aea599da-5bfb-458b-8e05-aade08df0a7e');
    expect(atraxa?.foil).toBe(true);
    const forest = document.cards.find((c) => c.name === 'Forest');
    expect(forest?.quantity).toBe(5);
    expect(document.cards.filter((c) => c.name === 'Sol Ring')).toHaveLength(1);
  });
});
