import { describe, it, expect } from 'vitest';

import {
  documentFromImportText,
  documentFromArchidektSnapshot,
  deckNameFromArchidektUrl,
  parseImportText,
  typeLineFromArchidektCard,
  normalizeArchidektCategoryName,
} from '../../../packages/web/src/deck-builder/import-export/import-deck.ts';

import { deckSize, totalCardQuantity } from '../../../packages/shared/src/deck-builder/browse.ts';

import commander from '../../fixtures/deck-builder/commander-slice.json';



describe('import', () => {

  it('parses paste text into a deck document', () => {

    const doc = documentFromImportText('[Creature]\n1 Sol Ring\n1 Forest', { name: 'Paste' });

    expect(doc.cards).toHaveLength(2);

    expect(doc.name).toBe('Paste');

    expect(doc.cardLayoutDefault).toBe('stacked');

  });



  it('seeds swap queue from Queued In/Out on paste', () => {

    const doc = documentFromImportText(

      '[Queued In]\n1 In Card\n[Queued Out]\n1 Out Card\n[Creature]\n1 Bear',

      { name: 'Swaps' },

    );

    expect(doc.formalSwapEntries).toHaveLength(1);

    expect(doc.formalSwapEntries[0].inInstanceId).toBeTruthy();

    expect(doc.formalSwapEntries[0].outInstanceId).toBeTruthy();

  });

  it('aliases legacy New Set In/Out headers to Queued In/Out on paste', () => {
    const doc = documentFromImportText(
      '[New Set In]\n1 In Card\n[New Set Out]\n1 Out Card',
      { name: 'Legacy Swaps' },
    );
    expect(doc.categories.some((c) => c.name === 'Queued In')).toBe(true);
    expect(doc.categories.some((c) => c.name === 'Queued Out')).toBe(true);
    expect(doc.categories.some((c) => c.name === 'New Set In')).toBe(false);
    expect(doc.formalSwapEntries).toHaveLength(1);
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



  it('parseImportText handles categories, quantities, and bare lines', () => {
    const parsed = parseImportText('[Creature{tag}]\n2 Sol Ring\n3 Forest\nMana Crypt');
    expect(parsed[0]).toMatchObject({ category: 'Creature', quantity: 2, name: 'Sol Ring' });
    expect(parsed[1]).toMatchObject({ category: 'Creature', quantity: 3, name: 'Forest' });
    expect(parsed[2]).toMatchObject({ category: 'Creature', quantity: 1, name: 'Mana Crypt' });
    expect(parseImportText('')).toEqual([]);
    expect(parseImportText('2x Sol Ring')[0]).toMatchObject({ quantity: 1, name: '2x Sol Ring' });
  });

  it('typeLineFromArchidektCard resolves nested oracle shapes', () => {
    expect(typeLineFromArchidektCard({ type_line: 'Artifact' })).toBe('Artifact');
    expect(typeLineFromArchidektCard({ typeLine: '  ' })).toBe(null);
    expect(typeLineFromArchidektCard({ oracleCard: { type_line: 'Land' } })).toBe('Land');
    expect(typeLineFromArchidektCard({ oracle_card: { typeLine: 'Creature' } })).toBe('Creature');
    expect(
      typeLineFromArchidektCard({ card: { oracle_card: { type_line: 'Instant' } } }),
    ).toBe('Instant');
    expect(typeLineFromArchidektCard({ card: { typeLine: 'Sorcery' } })).toBe('Sorcery');
    expect(typeLineFromArchidektCard({})).toBe(null);
  });

  it('normalizeArchidektCategoryName aliases Lieutenant and legacy swap queues', () => {
    expect(normalizeArchidektCategoryName('Lieutenant')).toBe('Lieutenants');
    expect(normalizeArchidektCategoryName('New Set In')).toBe('Queued In');
    expect(normalizeArchidektCategoryName('New Set Out')).toBe('Queued Out');
    expect(normalizeArchidektCategoryName('  Ramp  ')).toBe('Ramp');
  });

  it('deckNameFromArchidektUrl returns null for missing or invalid URLs', () => {
    expect(deckNameFromArchidektUrl(null)).toBe(null);
    expect(deckNameFromArchidektUrl('https://example.com/decks/1/foo')).toBe(null);
  });

  it('documentFromImportText marks Maybeboard and swap categories', () => {
    const doc = documentFromImportText('[Maybeboard]\n1 Side Card\n[Queued In]\n1 In', {
      deckId: 'deck-1',
      formatHint: 'commander',
    });
    expect(doc.deckId).toBe('deck-1');
    expect(doc.format).toBe('commander');
    expect(doc.categories.find((c) => c.name === 'Maybeboard')?.includedInDeck).toBe(false);
    expect(doc.categories.find((c) => c.name === 'Queued In')?.includedInDeck).toBe(false);
    expect(doc.categories.find((c) => c.name === 'Queued In')?.includedInPrice).toBe(false);
  });

  it('documentFromArchidektSnapshot maps foil, uid, and dedupes categories', () => {
    const doc = documentFromArchidektSnapshot({
      id: 99,
      deck_name: 'Snapshot Deck',
      cards: [
        {
          id: 1,
          name: 'Foil Bolt',
          quantity: 2,
          primary_category: 'Instant',
          categories: ['Instant'],
          modifier: 'Foil',
          uid: 'sf-uid-1',
          colorIdentity: ['R'],
        },
        {
          id: 2,
          name: 'Unknown',
          quantity: 0,
          primary_category: 'Land',
        },
      ],
      categories: [
        { name: 'Instant', includedInDeck: true, includedInPrice: true },
        { name: 'Instant', includedInDeck: false, includedInPrice: true },
      ],
    });
    expect(doc.archidektId).toBe(99);
    expect(doc.name).toBe('Snapshot Deck');
    expect(doc.cards.find((c) => c.name === 'Foil Bolt')?.foil).toBe(true);
    expect(doc.cards.find((c) => c.name === 'Foil Bolt')?.scryfallId).toBe('sf-uid-1');
    expect(doc.cards.find((c) => c.name === 'Foil Bolt')?.colourIdentity).toEqual(['R']);
    expect(doc.cards.find((c) => c.name === 'Unknown')?.quantity).toBe(1);
    expect(doc.categories.filter((c) => c.name === 'Instant')).toHaveLength(1);
    expect(doc.categories.find((c) => c.name === 'Instant')?.includedInDeck).toBe(false);
  });

  it('documentFromArchidektSnapshot inherits name, swaps, and category_settings fallback', () => {
    const existing = {
      ...commander,
      archidektUrl: 'https://archidekt.com/decks/1/existing_slug',
      name: 'Existing Name',
      deckId: 'keep-id',
      cardLayoutDefault: 'grid' as const,
      browseViewDefault: 'colour' as const,
    };
    const fromSettings = documentFromArchidektSnapshot({
      deck_id: 1,
      cards: [{ id: 1, name: 'Sol Ring', primary_category: 'Artifact', categories: ['Artifact'] }],
      category_settings: { Artifact: { includedInDeck: true, includedInPrice: false } },
    });
    expect(fromSettings.categories[0].includedInPrice).toBe(false);

    const inherited = documentFromArchidektSnapshot(
      { cards: [{ id: 1, name: 'Sol Ring', primary_category: 'Artifact', categories: ['Artifact'] }] },
      existing,
      { nameOverride: '  Override Name  ' },
    );
    expect(inherited.name).toBe('Override Name');
    expect(inherited.deckId).toBe('keep-id');
    expect(inherited.cardLayoutDefault).toBe('grid');
    expect(inherited.browseViewDefault).toBe('colour');

    const fromUrl = documentFromArchidektSnapshot({ url: 'https://archidekt.com/decks/2/my_deck' }, existing);
    expect(fromUrl.name).toBe('My Deck');
  });

  it('documentFromArchidektSnapshot seeds swaps when existing has none', () => {
    const snap = {
      deck_id: 1,
      name: 'Swaps',
      cards: [
        { id: 1, name: 'In Card', primary_category: 'Queued In', categories: ['Queued In'] },
        { id: 2, name: 'Out Card', primary_category: 'Queued Out', categories: ['Queued Out'] },
      ],
      categories: [
        { name: 'Queued In', includedInDeck: false, includedInPrice: false },
        { name: 'Queued Out', includedInDeck: false, includedInPrice: false },
      ],
    };
    const doc = documentFromArchidektSnapshot(snap);
    expect(doc.formalSwapEntries.length).toBeGreaterThan(0);
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


