import { describe, expect, it } from 'vitest';
import {
  DeckDocumentSchema,
  COMMANDER_DECK_TARGET,
  deckHeaderTarget,
  deckSizeMismatch,
  defaultPendragonCategoryDefs,
  detectDeckFormat,
  formatScryfallClause,
  isCommandZoneFormat,
  builderFormatForDeck,
  deckBelongsToBuilder,
  isPendragonAddLegal,
  isPendragonArthurType,
  isPendragonExcaliburType,
  normalizeCardQuantities,
  PENDRAGON_ARTHUR_QUERY,
  PENDRAGON_EXCALIBUR_QUERY,
  PENDRAGON_NINETY_EIGHT_QUERY,
  placeCardInUniqueHeaderSlot,
  remapPendragonDocumentHeaders,
  remapPendragonImportCategory,
  type CardInstance,
} from '@rayenz-hub/shared';

function card(
  over: Partial<CardInstance> & Pick<CardInstance, 'name' | 'instanceId' | 'primaryCategory'>,
): CardInstance {
  return {
    quantity: 1,
    categories: [over.primaryCategory],
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
    ...over,
  };
}

describe('command-zone format helpers', () => {
  it('treats commander and pendragon as command-zone formats in commander builder', () => {
    expect(isCommandZoneFormat('commander')).toBe(true);
    expect(isCommandZoneFormat('pendragon')).toBe(true);
    expect(isCommandZoneFormat('cube')).toBe(false);
    expect(builderFormatForDeck('pendragon')).toBe('commander');
    expect(deckBelongsToBuilder('pendragon', 'commander')).toBe(true);
    expect(deckBelongsToBuilder('pendragon', 'cube')).toBe(false);
    expect(DeckDocumentSchema.parse({
      schemaVersion: 1,
      deckId: 'p1',
      name: 'Pendragon',
      format: 'pendragon',
      categories: [],
      cards: [],
      oracle: {},
      formalSwapEntries: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).format).toBe('pendragon');
  });

  it('detects pendragon from format or name', () => {
    expect(detectDeckFormat({ format: 'pendragon' })).toBe('pendragon');
    expect(detectDeckFormat({ name: 'My Pendragon brew' })).toBe('pendragon');
    expect(detectDeckFormat({ name: 'Atraxa' })).toBe('commander');
  });
});

describe('Pendragon type and commons legality', () => {
  it('accepts any creature face as Arthur', () => {
    expect(isPendragonArthurType('Creature — Human Knight')).toBe(true);
    expect(isPendragonArthurType('Legendary Creature — Human')).toBe(true);
    expect(isPendragonArthurType('Instant')).toBe(false);
    expect(isPendragonArthurType('Land // Creature — Human')).toBe(true);
  });

  it('accepts a castable legendary equipment face as Excalibur, including MDFCs', () => {
    expect(isPendragonExcaliburType('Legendary Artifact — Equipment')).toBe(true);
    expect(isPendragonExcaliburType('Legendary Artifact Creature — Equipment')).toBe(true);
    expect(isPendragonExcaliburType('Land // Legendary Artifact — Equipment')).toBe(true);
    expect(isPendragonExcaliburType('Legendary Artifact — Equipment // Land')).toBe(true);
    expect(isPendragonExcaliburType('Legendary Land // Artifact — Equipment')).toBe(false);
    expect(isPendragonExcaliburType('Artifact — Equipment')).toBe(false);
  });

  it('treats commons as oracle-level; uncommon reprints of a common oracle stay legal', () => {
    expect(
      isPendragonAddLegal('Arthur', {
        typeLine: 'Creature — Human Knight',
        hasCommonPrinting: true,
      }),
    ).toBe(true);
    expect(
      isPendragonAddLegal('Other', { hasCommonPrinting: true }),
    ).toBe(true);
    expect(
      isPendragonAddLegal('Other', { hasCommonPrinting: null }),
    ).toBe(true);
    expect(
      isPendragonAddLegal('Other', { hasCommonPrinting: false }),
    ).toBe(false);
    expect(
      isPendragonAddLegal('Arthur', {
        typeLine: 'Creature — Human Knight',
        hasCommonPrinting: false,
      }),
    ).toBe(false);
    expect(
      isPendragonAddLegal('Excalibur', {
        typeLine: 'Legendary Artifact — Equipment',
        hasCommonPrinting: false,
      }),
    ).toBe(true);
  });

  it('uses role Scryfall clauses, not legal:pauper', () => {
    expect(formatScryfallClause('pendragon')).toBe(PENDRAGON_NINETY_EIGHT_QUERY);
    expect(formatScryfallClause('pendragon', 'arthur')).toBe(PENDRAGON_ARTHUR_QUERY);
    expect(formatScryfallClause('pendragon', 'excalibur')).toBe(PENDRAGON_EXCALIBUR_QUERY);
    expect(PENDRAGON_NINETY_EIGHT_QUERY).toBe('r:c legal:commander');
    expect(PENDRAGON_NINETY_EIGHT_QUERY).not.toContain('pauper');
    expect(formatScryfallClause('commander')).toBe('format:commander');
  });
});

describe('Pendragon import remap and unique slots', () => {
  it('maps Commander / Lieutenant(s) onto Arthur / Excalibur', () => {
    expect(remapPendragonImportCategory('Commander', 'pendragon')).toBe('Arthur');
    expect(remapPendragonImportCategory('Lieutenants', 'pendragon')).toBe('Excalibur');
    expect(remapPendragonImportCategory('Lieutenant', 'pendragon')).toBe('Excalibur');
    const remapped = remapPendragonDocumentHeaders(
      DeckDocumentSchema.parse({
        schemaVersion: 1,
        deckId: 'p1',
        name: 'Imported',
        format: 'pendragon',
        categories: [
          { name: 'Commander', includedInDeck: true, includedInPrice: true },
          { name: 'Lieutenants', includedInDeck: true, includedInPrice: true },
        ],
        cards: [
          card({ instanceId: 'a', name: 'Arthur', primaryCategory: 'Commander' }),
          card({ instanceId: 'e', name: 'Excalibur', primaryCategory: 'Lieutenants' }),
        ],
        oracle: {},
        formalSwapEntries: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(remapped.cards.map((c) => c.primaryCategory)).toEqual(['Arthur', 'Excalibur']);
    expect(remapped.categories.map((c) => c.name)).toEqual(['Arthur', 'Excalibur']);
  });

  it('displaces the previous unique-slot occupant to Other', () => {
    const cards = [
      card({ instanceId: 'old', name: 'Old Arthur', primaryCategory: 'Arthur' }),
      card({ instanceId: 'next', name: 'New Arthur', primaryCategory: 'Creature' }),
    ];
    const next = placeCardInUniqueHeaderSlot(cards, 'next', 'Arthur');
    expect(next.find((c) => c.instanceId === 'next')?.primaryCategory).toBe('Arthur');
    expect(next.find((c) => c.instanceId === 'old')?.primaryCategory).toBe('Other');
  });

  it('seeds Arthur and Excalibur category defs', () => {
    expect(defaultPendragonCategoryDefs().map((c) => c.name)).toEqual([
      'Arthur',
      'Excalibur',
      'Maybeboard',
    ]);
  });
});

describe('Pendragon singleton and 100-card size', () => {
  it('expands non-basic quantities like commander', () => {
    const cards = [
      card({ instanceId: 's1', name: 'Sol Ring', primaryCategory: 'Artifact', quantity: 2 }),
    ];
    const out = normalizeCardQuantities(cards, 'pendragon', (p) => `${p}-x`);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.quantity === 1)).toBe(true);
  });

  it('warns when size is not 100 and hides a header target', () => {
    const deck = {
      format: 'pendragon' as const,
      cards: [card({ instanceId: 'a', name: 'Bear', primaryCategory: 'Creature' })],
      categories: defaultPendragonCategoryDefs(),
      coverInstanceId: null,
      cubeTargetSize: null,
    };
    expect(COMMANDER_DECK_TARGET).toBe(100);
    expect(deckSizeMismatch(deck)).toBe(true);
    expect(deckHeaderTarget(deck)).toBeNull();
  });
});
