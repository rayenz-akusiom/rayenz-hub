import { describe, expect, it } from 'vitest';
import { emptyCardOracle, oracleKey, type DeckDocument } from '@rayenz-hub/shared';
import {
  mergeAcquiredWithPreconLands,
  nonBasicLandsFromPreconDeck,
} from '../../../packages/web/src/order-reconcile/precon-lands.ts';
import { cardInstance, leanDeck } from '../helpers/deck-fixtures.ts';

function withOracle(
  deck: DeckDocument,
  cards: { card: ReturnType<typeof cardInstance>; typeLine: string }[],
): DeckDocument {
  const oracle: DeckDocument['oracle'] = {};
  const instances = cards.map(({ card, typeLine }) => {
    oracle[oracleKey(card)] = emptyCardOracle({ typeLine });
    return card;
  });
  return { ...deck, cards: instances, oracle };
}

describe('nonBasicLandsFromPreconDeck', () => {
  it('keeps non-basic lands and drops basics, creatures, and commanders', () => {
    const forest = cardInstance({
      instanceId: 'c1',
      name: 'Forest',
      primaryCategory: 'Lands',
      setCode: 'c16',
      collectorNumber: '351',
    });
    const reliquary = cardInstance({
      instanceId: 'c2',
      name: 'Reliquary Tower',
      primaryCategory: 'Lands',
      setCode: 'c16',
      collectorNumber: '309',
    });
    const solRing = cardInstance({
      instanceId: 'c3',
      name: 'Sol Ring',
      primaryCategory: 'Ramp',
      setCode: 'c16',
      collectorNumber: '267',
    });
    const commander = cardInstance({
      instanceId: 'c4',
      name: 'Atraxa, Praetors\' Voice',
      primaryCategory: 'Commander',
      setCode: 'c16',
      collectorNumber: '28',
    });
    const doc = withOracle(leanDeck({ deckId: 'precon-1', name: 'Breed Lethality' }), [
      { card: forest, typeLine: 'Basic Land — Forest' },
      { card: reliquary, typeLine: 'Land' },
      { card: solRing, typeLine: 'Artifact' },
      { card: commander, typeLine: 'Legendary Creature — Phyrexian Angel Horror' },
    ]);

    expect(nonBasicLandsFromPreconDeck(doc)).toEqual([
      {
        name: 'Reliquary Tower',
        quantity: 1,
        set_code: 'c16',
        collector_number: '309',
        finish: null,
      },
    ]);
  });

  it('falls back to Lands category when type line is missing', () => {
    const land = cardInstance({
      instanceId: 'c1',
      name: 'Command Tower',
      primaryCategory: 'Lands',
      setCode: 'c21',
      collectorNumber: '284',
    });
    const basic = cardInstance({
      instanceId: 'c2',
      name: 'Island',
      primaryCategory: 'Lands',
    });
    const doc = leanDeck({
      deckId: 'precon-2',
      name: 'No Oracle',
      cards: [land, basic],
      oracle: {},
    });

    expect(nonBasicLandsFromPreconDeck(doc).map((c) => c.name)).toEqual(['Command Tower']);
  });

  it('maps foil finish and quantity', () => {
    const land = cardInstance({
      instanceId: 'c1',
      name: 'Exotic Orchard',
      primaryCategory: 'Lands',
      quantity: 2,
      foil: true,
      setCode: 'ncc',
      collectorNumber: '400',
    });
    const doc = withOracle(leanDeck({ deckId: 'precon-3', name: 'Foil Lands' }), [
      { card: land, typeLine: 'Land' },
    ]);

    expect(nonBasicLandsFromPreconDeck(doc)).toEqual([
      {
        name: 'Exotic Orchard',
        quantity: 2,
        set_code: 'ncc',
        collector_number: '400',
        finish: 'foil',
      },
    ]);
  });
});

describe('mergeAcquiredWithPreconLands', () => {
  it('merges qty for matching name/set/#/finish', () => {
    const land = cardInstance({
      instanceId: 'c1',
      name: 'Command Tower',
      primaryCategory: 'Lands',
      setCode: 'c16',
      collectorNumber: '1',
    });
    const doc = withOracle(leanDeck({ deckId: 'precon-4', name: 'Merge' }), [
      { card: land, typeLine: 'Land' },
    ]);

    const merged = mergeAcquiredWithPreconLands(
      [{ id: 'acq-0', name: 'Command Tower', quantity: 1, set_code: 'c16', collector_number: '1', finish: null }],
      [doc],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.quantity).toBe(2);
    expect(merged[0]?.name).toBe('Command Tower');
  });
});
