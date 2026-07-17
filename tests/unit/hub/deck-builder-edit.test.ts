import { describe, it, expect } from 'vitest';
import { moveCardCategory } from '../../../packages/shared/src/deck-builder/browse.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';
import {
  applyAddCard,
  applyCardMove,
  applyChangePrinting,
  applyRemoveCard,
} from '../../../packages/web/src/deck-builder/edit/card-mutations.ts';
import {
  cardSupportsFoilToggle,
  mapScryfallCardToPrinting,
  setCardFoil,
  setCardProxy,
  type DeckDocument,
} from '../../../packages/shared/src/index.ts';

describe('card mutations', () => {
  it('moves category and stack', () => {
    const next = moveCardCategory(commander.cards, 'c1', 'Ramp', 'Rocks');
    const card = next.find((c) => c.instanceId === 'c1');
    expect(card.primaryCategory).toBe('Ramp');
    expect(card.stack).toBe('Rocks');
  });

  it('applyCardMove updates document timestamp', () => {
    const doc = applyCardMove(commander, 'c1', 'Enchantment', null);
    expect(doc.cards.find((c) => c.instanceId === 'c1').primaryCategory).toBe('Enchantment');
    expect(doc.updatedAt).toBeTruthy();
  });

  it('applyAddCard / applyRemoveCard / applyChangePrinting', () => {
    const printing = mapScryfallCardToPrinting({
      id: 'sf-1',
      name: 'Lightning Bolt',
      set: 'lea',
      collector_number: '161',
      type_line: 'Instant',
      color_identity: ['R'],
      finishes: ['nonfoil'],
    });
    const added = applyAddCard(commander, printing, 'Maybeboard', { proxy: true });
    const newCard = added.cards.find((c) => c.name === 'Lightning Bolt');
    expect(newCard).toBeTruthy();
    expect(newCard!.proxy).toBe(true);
    expect(added.categories.some((c) => c.name === 'Proxies' && c.includedInPrice === false)).toBe(
      true,
    );

    const changed = applyChangePrinting(
      added,
      newCard!.instanceId,
      {
        ...printing,
        scryfallId: 'sf-2',
        setCode: 'm10',
        collectorNumber: '146',
      },
      { proxy: false },
    );
    expect(changed.cards.find((c) => c.instanceId === newCard!.instanceId)!.setCode).toBe('m10');
    expect(changed.cards.find((c) => c.instanceId === newCard!.instanceId)!.proxy).toBe(false);

    const removed = applyRemoveCard(changed, newCard!.instanceId);
    expect(removed.cards.find((c) => c.instanceId === newCard!.instanceId)).toBeUndefined();
  });
});

describe('setCardFoil', () => {
  it('enables foil only when oracle finishes include foil', () => {
    const base = commander as DeckDocument;
    const card = { ...base.cards[0]!, scryfallId: 'foil-ok-id', foil: false };
    const doc: DeckDocument = {
      ...base,
      cards: [card, ...base.cards.slice(1)],
      oracle: {
        'id:foil-ok-id': {
          scryfallId: 'foil-ok-id',
          colourIdentity: [],
          typeLine: null,
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: null,
          imageUrl: null,
          finishes: ['nonfoil', 'foil'],
          updatedAt: null,
        },
      },
    };
    expect(cardSupportsFoilToggle(doc, card)).toBe(true);
    const on = setCardFoil(doc, card.instanceId, true);
    expect(on.cards[0]!.foil).toBe(true);
    const off = setCardFoil(on, card.instanceId, false);
    expect(off.cards[0]!.foil).toBe(false);
  });

  it('refuses enabling foil when finishes lack foil', () => {
    const base = commander as DeckDocument;
    const card = { ...base.cards[0]!, scryfallId: 'no-foil-id', foil: false };
    const doc: DeckDocument = {
      ...base,
      cards: [card, ...base.cards.slice(1)],
      oracle: {
        'id:no-foil-id': {
          scryfallId: 'no-foil-id',
          colourIdentity: [],
          typeLine: null,
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: null,
          imageUrl: null,
          finishes: ['nonfoil'],
          updatedAt: null,
        },
      },
    };
    expect(cardSupportsFoilToggle(doc, card)).toBe(false);
    expect(setCardFoil(doc, card.instanceId, true).cards[0]!.foil).toBe(false);
  });
});

describe('setCardProxy', () => {
  it('toggles proxy and ensures Proxies category def', () => {
    const base = commander as DeckDocument;
    const card = { ...base.cards[0]!, proxy: false };
    const doc: DeckDocument = { ...base, cards: [card, ...base.cards.slice(1)] };
    const on = setCardProxy(doc, card.instanceId, true);
    expect(on.cards[0]!.proxy).toBe(true);
    expect(on.categories.find((c) => c.name === 'Proxies')).toMatchObject({
      includedInDeck: true,
      includedInPrice: false,
    });
    const off = setCardProxy(on, card.instanceId, false);
    expect(off.cards[0]!.proxy).toBe(false);
  });
});
