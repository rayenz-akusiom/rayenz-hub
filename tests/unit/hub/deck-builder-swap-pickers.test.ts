import { describe, expect, it } from 'vitest';
import type { CardInstance, DeckDocument, PrintingFields } from '@rayenz-hub/shared';
import {
  buildOutPickerItems,
  findMatchingPrintingInstance,
} from '../../../packages/web/src/deck-builder/swaps/swap-pickers.ts';
import commanderFixture from '../../fixtures/deck-builder/commander-slice.json';

const deck = commanderFixture as DeckDocument;

describe('buildOutPickerItems', () => {
  it('maps deck cards to picker items keyed by instanceId', () => {
    const items = buildOutPickerItems(deck.cards);
    expect(items).toHaveLength(deck.cards.length);
    expect(items[0]).toEqual(
      expect.objectContaining({
        value: deck.cards[0]!.instanceId,
        category: deck.cards[0]!.primaryCategory,
        faceKey: deck.cards[0]!.instanceId,
      }),
    );
    expect(items[0]!.lines?.[0]).toBe(deck.cards[0]!.name);
  });
});

describe('findMatchingPrintingInstance', () => {
  const printing = (over: Partial<PrintingFields> & Pick<PrintingFields, 'name'>): PrintingFields => ({
    scryfallId: over.scryfallId ?? 'sf-x',
    setCode: over.setCode ?? 'm12',
    collectorNumber: over.collectorNumber ?? '165',
    typeLine: over.typeLine ?? null,
    colourIdentity: over.colourIdentity ?? ['G'],
    layout: over.layout ?? null,
    foil: over.foil ?? false,
    printedName: over.printedName ?? null,
    flavorName: over.flavorName ?? null,
    manaValue: over.manaValue ?? null,
    name: over.name,
  });

  it('matches by scryfallId and foil', () => {
    const withSf: DeckDocument = {
      ...deck,
      cards: deck.cards.map((c, i) =>
        i === 0 ? ({ ...c, scryfallId: 'sf-match', foil: true } as CardInstance) : c,
      ),
    };
    const found = findMatchingPrintingInstance(
      withSf,
      printing({ name: withSf.cards[0]!.name, scryfallId: 'sf-match', foil: true }),
    );
    expect(found?.instanceId).toBe(withSf.cards[0]!.instanceId);
  });

  it('falls back to set + collector + foil + name', () => {
    const found = findMatchingPrintingInstance(
      deck,
      printing({
        name: deck.cards[0]!.name,
        scryfallId: 'other-id',
        setCode: deck.cards[0]!.setCode || 'm12',
        collectorNumber: deck.cards[0]!.collectorNumber || '165',
        foil: false,
      }),
    );
    expect(found?.instanceId).toBe(deck.cards[0]!.instanceId);
  });

  it('returns null when nothing matches', () => {
    expect(
      findMatchingPrintingInstance(
        deck,
        printing({ name: 'Totally Missing', scryfallId: 'nope', setCode: 'zzz', collectorNumber: '0' }),
      ),
    ).toBeNull();
  });
});
