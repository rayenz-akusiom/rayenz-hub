import { describe, expect, it } from 'vitest';
import type { CardInstance, DeckDocument, PrintingFields } from '@rayenz-hub/shared';
import {
  buildOutPickerItems,
  findMatchingPrintingInstance,
  outPickerCards,
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

  it('shows quantity on multi-qty stacks', () => {
    const stack = {
      ...deck.cards[1]!,
      instanceId: 'plains-stack',
      name: 'Plains',
      quantity: 6,
    } as CardInstance;
    const items = buildOutPickerItems([stack]);
    expect(items[0]!.lines?.[0]).toBe('Plains ×6');
  });
});

describe('outPickerCards', () => {
  it('excludes formal-swap Ins and Seeking, keeps Queued Out', () => {
    const withSwap: DeckDocument = {
      ...deck,
      cards: [
        {
          ...deck.cards[0]!,
          instanceId: 'in-card',
          name: 'In Card',
          primaryCategory: 'Ramp',
          categories: ['Ramp'],
        },
        {
          ...deck.cards[0]!,
          instanceId: 'out-card',
          name: 'Out Card',
          primaryCategory: 'Queued Out',
          categories: ['Queued Out'],
        },
        {
          ...deck.cards[0]!,
          instanceId: 'seek-card',
          name: 'Seek Card',
          primaryCategory: 'Seeking',
          categories: ['Seeking'],
        },
        {
          ...deck.cards[0]!,
          instanceId: 'normal',
          name: 'Normal Card',
          primaryCategory: 'Other',
          categories: ['Other'],
        },
      ],
      formalSwapEntries: [
        {
          id: 's1',
          inInstanceId: 'in-card',
          outInstanceId: 'out-card',
          inTargetCategory: 'Ramp',
          sortIndex: 0,
          notes: null,
        },
      ],
      lookingForEntries: [{ id: 'lf1', instanceId: 'seek-card', sortIndex: 0, notes: null }],
    };

    const ids = outPickerCards(withSwap).map((c) => c.instanceId);
    expect(ids).toContain('out-card');
    expect(ids).toContain('normal');
    expect(ids).not.toContain('in-card');
    expect(ids).not.toContain('seek-card');
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
        i === 0 ? ({ ...c, scryfallId: 'sf-match', foil: true, proxy: false } as CardInstance) : c,
      ),
    };
    const found = findMatchingPrintingInstance(
      withSf,
      printing({ name: withSf.cards[0]!.name, scryfallId: 'sf-match', foil: true }),
      { proxy: false },
    );
    expect(found?.instanceId).toBe(withSf.cards[0]!.instanceId);
  });

  it('does not match when proxy flag differs', () => {
    const withSf: DeckDocument = {
      ...deck,
      cards: deck.cards.map((c, i) =>
        i === 0 ? ({ ...c, scryfallId: 'sf-match', foil: false, proxy: true } as CardInstance) : c,
      ),
    };
    expect(
      findMatchingPrintingInstance(
        withSf,
        printing({ name: withSf.cards[0]!.name, scryfallId: 'sf-match', foil: false }),
        { proxy: false },
      ),
    ).toBeNull();
    expect(
      findMatchingPrintingInstance(
        withSf,
        printing({ name: withSf.cards[0]!.name, scryfallId: 'sf-match', foil: false }),
        { proxy: true },
      )?.instanceId,
    ).toBe(withSf.cards[0]!.instanceId);
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
