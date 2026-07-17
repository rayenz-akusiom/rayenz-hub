import { describe, it, expect } from 'vitest';

import { documentFromImportText, documentFromArchidektSnapshot, deckNameFromArchidektUrl } from '../../../packages/web/src/deck-builder/import-export/import-deck.ts';

import { deckSize, totalCardQuantity } from '../../../packages/shared/src/deck-builder/browse.ts';

import commander from '../../fixtures/deck-builder/commander-slice.json';



describe('import', () => {

  it('parses paste text into a deck document', () => {

    const doc = documentFromImportText('[Creature]\n1 Sol Ring\n1 Forest', { name: 'Paste' });

    expect(doc.cards).toHaveLength(2);

    expect(doc.name).toBe('Paste');

    expect(doc.cardLayoutDefault).toBe('stacked');

  });



  it('seeds swap queue from New Set In/Out on paste', () => {

    const doc = documentFromImportText(

      '[New Set In]\n1 In Card\n[New Set Out]\n1 Out Card\n[Creature]\n1 Bear',

      { name: 'Swaps' },

    );

    expect(doc.formalSwapEntries).toHaveLength(1);

    expect(doc.formalSwapEntries[0].inInstanceId).toBeTruthy();

    expect(doc.formalSwapEntries[0].outInstanceId).toBeTruthy();

  });



  it('maps bridge-shaped snapshot name and category_settings', () => {

    const snap = {

      deck_id: 9933193,

      deck_name: 'WINDS, HEED MY COMMAND',

      cards: [

        {

          id: 1,

          name: 'Commander Card',

          quantity: 1,

          primary_category: 'Commander',

          categories: ['Commander'],

        },

        {

          id: 2,

          name: 'Maybe Card',

          quantity: 1,

          primary_category: 'Maybeboard',

          categories: ['Maybeboard'],

        },

        {

          id: 3,

          name: 'Forest',

          quantity: 2,

          primary_category: 'Land',

          categories: ['Land'],

          type_line: 'Basic Land — Forest',

        },

      ],

      category_settings: {

        Commander: { includedInDeck: true, includedInPrice: true },

        Land: { includedInDeck: true, includedInPrice: true },

        Maybeboard: { includedInDeck: false, includedInPrice: true },

      },

    };

    const doc = documentFromArchidektSnapshot(snap);

    expect(doc.name).toBe('WINDS, HEED MY COMMAND');

    expect(doc.categories.find((c) => c.name === 'Maybeboard')?.includedInDeck).toBe(false);

    expect(deckSize(doc)).toBe(3);

    expect(totalCardQuantity(doc.cards)).toBe(4);

    expect(doc.cards).toHaveLength(3);

    expect(doc.cards.find((c) => c.name === 'Forest')?.quantity).toBe(2);

  });

  it('aliases Archidekt Lieutenant category to Lieutenants', () => {
    const doc = documentFromArchidektSnapshot({
      deck_id: 1,
      deck_name: 'Partner Deck',
      cards: [
        {
          id: 1,
          name: 'Commander A',
          quantity: 1,
          primary_category: 'Commander',
          categories: ['Commander'],
        },
        {
          id: 2,
          name: 'Partner B',
          quantity: 1,
          primary_category: 'Lieutenant',
          categories: ['Lieutenant'],
        },
      ],
      category_settings: {
        Commander: { includedInDeck: true, includedInPrice: true },
        Lieutenant: { includedInDeck: true, includedInPrice: true },
      },
    });
    const partner = doc.cards.find((c) => c.name === 'Partner B');
    expect(partner?.primaryCategory).toBe('Lieutenants');
    expect(partner?.categories).toEqual(['Lieutenants']);
    expect(doc.categories.find((c) => c.name === 'Lieutenant')).toBeUndefined();
    expect(doc.categories.find((c) => c.name === 'Lieutenants')).toMatchObject({
      name: 'Lieutenants',
      includedInDeck: true,
    });
  });

  it('imports typeLine from nested card.oracleCard', () => {
    const doc = documentFromArchidektSnapshot({
      deck_id: 42,
      name: 'Cube',
      cards: [
        {
          id: 1,
          name: 'Hallowed Fountain',
          quantity: 1,
          primary_category: 'White',
          categories: ['White'],
          color_identity: ['W', 'U'],
          card: {
            oracleCard: {
              typeLine: 'Land — Plains Island',
            },
          },
        },
      ],
      category_settings: {
        White: { includedInDeck: true, includedInPrice: true },
      },
    });
    expect(doc.cards[0].typeLine).toBe('Land — Plains Island');
    expect(doc.cards[0].colourIdentity).toEqual(['W', 'U']);
  });



  it('derives deck name from Archidekt URL slug when deck_name absent', () => {

    expect(deckNameFromArchidektUrl('https://archidekt.com/decks/9933193/winds_heed_my_command')).toBe(

      'Winds Heed My Command',

    );

    const doc = documentFromArchidektSnapshot({

      deck_id: 9933193,

      url: 'https://archidekt.com/decks/9933193/winds_heed_my_command',

      cards: [

        {

          id: 1,

          name: 'Sol Ring',

          quantity: 1,

          primary_category: 'Artifact',

          categories: ['Artifact'],

        },

      ],

      categories: [{ name: 'Artifact', includedInDeck: true, includedInPrice: true }],

    });

    expect(doc.name).toBe('Winds Heed My Command');

  });



  it('refresh keep-swaps vs clear-swaps', () => {

    const existing = {

      ...commander,

      formalSwapEntries: [

        { id: 's1', inInstanceId: 'c1', outInstanceId: 'c2', sortIndex: 0, notes: null },

      ],

    };

    const snap = {

      deck_id: 1,

      name: 'Fixture Commander',

      cards: existing.cards.map((c) => ({

        id: c.archidektCardId,

        name: c.name,

        primary_category: c.primaryCategory,

        categories: c.categories,

        color_identity: c.colourIdentity,

        type_line: c.typeLine,

        set_code: c.setCode,

        collector_number: c.collectorNumber,

      })),

      categories: existing.categories,

    };

    const kept = documentFromArchidektSnapshot(snap, existing, { clearSwaps: false });

    expect(kept.formalSwapEntries).toHaveLength(1);

    const cleared = documentFromArchidektSnapshot(snap, existing, { clearSwaps: true });

    expect(cleared.formalSwapEntries).toHaveLength(0);

  });

});


