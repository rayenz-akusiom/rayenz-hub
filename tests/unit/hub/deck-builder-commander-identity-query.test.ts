import { describe, expect, it } from 'vitest';
import {
  commanderIdentityScryfallQuery,
  emptyCardOracle,
  oracleKey,
  type CardInstance,
  type DeckDocument,
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

function deck(
  over: Partial<Pick<DeckDocument, 'format' | 'cards' | 'oracle'>> = {},
): Pick<DeckDocument, 'format' | 'cards' | 'oracle'> {
  return {
    format: 'commander',
    cards: [],
    oracle: {},
    ...over,
  };
}

function withOracle(
  c: CardInstance,
  oracle: Parameters<typeof emptyCardOracle>[0],
): { card: CardInstance; entry: [string, ReturnType<typeof emptyCardOracle>] } {
  return { card: c, entry: [oracleKey(c), emptyCardOracle(oracle)] };
}

describe('commanderIdentityScryfallQuery', () => {
  it('returns null for non-commander formats', () => {
    const { card: cmd, entry } = withOracle(
      card({
        instanceId: 'cmd',
        name: 'Atraxa, Praetors\' Voice',
        primaryCategory: 'Commander',
        scryfallId: 'sf-atraxa',
      }),
      { colourIdentity: ['W', 'U', 'B', 'G'], typeLine: 'Legendary Creature' },
    );
    expect(
      commanderIdentityScryfallQuery(
        deck({ format: 'cube', cards: [cmd], oracle: Object.fromEntries([entry]) }),
      ),
    ).toBeNull();
  });

  it('returns null when no commanders are set', () => {
    const { card: creature, entry } = withOracle(
      card({
        instanceId: 'c1',
        name: 'Birds of Paradise',
        primaryCategory: 'Creature',
        scryfallId: 'sf-bop',
      }),
      { colourIdentity: ['G'], typeLine: 'Creature — Bird' },
    );
    expect(
      commanderIdentityScryfallQuery(
        deck({ cards: [creature], oracle: Object.fromEntries([entry]) }),
      ),
    ).toBeNull();
  });

  it('returns id:… for a single commander identity', () => {
    const { card: cmd, entry } = withOracle(
      card({
        instanceId: 'cmd',
        name: 'Atraxa, Praetors\' Voice',
        primaryCategory: 'Commander',
        scryfallId: 'sf-atraxa',
      }),
      { colourIdentity: ['W', 'U', 'B', 'G'], typeLine: 'Legendary Creature' },
    );
    expect(
      commanderIdentityScryfallQuery(
        deck({ cards: [cmd], oracle: Object.fromEntries([entry]) }),
      ),
    ).toBe('id:wubg');
  });

  it('unions partner commander identities in WUBRG order', () => {
    const a = withOracle(
      card({
        instanceId: 'a',
        name: 'Ikra Shidiqi, the Usurper',
        primaryCategory: 'Commander',
        scryfallId: 'sf-ikra',
      }),
      { colourIdentity: ['B', 'G'], typeLine: 'Legendary Creature' },
    );
    const b = withOracle(
      card({
        instanceId: 'b',
        name: 'Reyhan, Last of the Abzan',
        primaryCategory: 'Commander',
        scryfallId: 'sf-reyhan',
      }),
      { colourIdentity: ['B', 'G', 'R'], typeLine: 'Legendary Creature' },
    );
    expect(
      commanderIdentityScryfallQuery(
        deck({
          cards: [a.card, b.card],
          oracle: Object.fromEntries([a.entry, b.entry]),
        }),
      ),
    ).toBe('id:brg');
  });

  it('returns id:c for colorless enriched commanders', () => {
    const { card: cmd, entry } = withOracle(
      card({
        instanceId: 'cmd',
        name: 'Kozilek, Butcher of Truth',
        primaryCategory: 'Commander',
        scryfallId: 'sf-kozilek',
      }),
      { colourIdentity: [], typeLine: 'Legendary Creature — Eldrazi' },
    );
    expect(
      commanderIdentityScryfallQuery(
        deck({ cards: [cmd], oracle: Object.fromEntries([entry]) }),
      ),
    ).toBe('id:c');
  });

  it('returns null when commander CI is empty and not enriched', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Unknown Commander',
      primaryCategory: 'Commander',
    });
    expect(commanderIdentityScryfallQuery(deck({ cards: [cmd] }))).toBeNull();
  });
});
