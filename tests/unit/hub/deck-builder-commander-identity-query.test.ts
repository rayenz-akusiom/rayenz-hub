import { describe, expect, it } from 'vitest';
import {
  commanderIdentityScryfallQuery,
  emptyCardOracle,
  isCardOutsideCommanderColourIdentity,
  oracleKey,
  resolveCommanderColourIdentity,
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

  it('unions Arthur and Excalibur colour identity for Pendragon', () => {
    const arthur = withOracle(
      card({
        instanceId: 'art',
        name: 'Knight of the White Orchid',
        primaryCategory: 'Arthur',
        scryfallId: 'sf-knight',
      }),
      { colourIdentity: ['W'], typeLine: 'Creature — Human Knight' },
    );
    const excalibur = withOracle(
      card({
        instanceId: 'exc',
        name: 'Sword of Feast and Famine',
        primaryCategory: 'Excalibur',
        scryfallId: 'sf-sword',
      }),
      { colourIdentity: ['B', 'G'], typeLine: 'Legendary Artifact — Equipment' },
    );
    expect(
      commanderIdentityScryfallQuery(
        deck({
          format: 'pendragon',
          cards: [arthur.card, excalibur.card],
          oracle: Object.fromEntries([arthur.entry, excalibur.entry]),
        }),
      ),
    ).toBe('id:wbg');
  });
});

describe('resolveCommanderColourIdentity / isCardOutsideCommanderColourIdentity', () => {
  it('does not flag cards when identity is unknown or format is cube', () => {
    const cmd = card({
      instanceId: 'cmd',
      name: 'Unknown Commander',
      primaryCategory: 'Commander',
    });
    expect(resolveCommanderColourIdentity(deck({ cards: [cmd] }))).toEqual({
      known: false,
      letters: [],
    });
    expect(
      isCardOutsideCommanderColourIdentity({ colourIdentity: ['G'] }, { known: false, letters: [] }),
    ).toBe(false);

    const { card: cmdCube, entry } = withOracle(
      card({
        instanceId: 'cmd',
        name: 'Atraxa, Praetors\' Voice',
        primaryCategory: 'Commander',
        scryfallId: 'sf-atraxa',
      }),
      { colourIdentity: ['W', 'U', 'B', 'G'], typeLine: 'Legendary Creature' },
    );
    expect(
      resolveCommanderColourIdentity(
        deck({ format: 'cube', cards: [cmdCube], oracle: Object.fromEntries([entry]) }),
      ),
    ).toEqual({ known: false, letters: [] });
  });

  it('flags green cards after Abzan → Orzhov commander swap', () => {
    const { card: cmd, entry } = withOracle(
      card({
        instanceId: 'cmd',
        name: 'Teysa Karlov',
        primaryCategory: 'Commander',
        scryfallId: 'sf-teysa',
      }),
      { colourIdentity: ['W', 'B'], typeLine: 'Legendary Creature' },
    );
    const identity = resolveCommanderColourIdentity(
      deck({ cards: [cmd], oracle: Object.fromEntries([entry]) }),
    );
    expect(identity).toEqual({ known: true, letters: ['W', 'B'] });
    expect(isCardOutsideCommanderColourIdentity({ colourIdentity: ['W', 'B'] }, identity)).toBe(
      false,
    );
    expect(isCardOutsideCommanderColourIdentity({ colourIdentity: ['G'] }, identity)).toBe(true);
    expect(
      isCardOutsideCommanderColourIdentity({ colourIdentity: ['W', 'B', 'G'] }, identity),
    ).toBe(true);
    expect(isCardOutsideCommanderColourIdentity({ colourIdentity: [] }, identity)).toBe(false);
  });

  it('flags coloured cards in a known colourless deck', () => {
    const { card: cmd, entry } = withOracle(
      card({
        instanceId: 'cmd',
        name: 'Kozilek, Butcher of Truth',
        primaryCategory: 'Commander',
        scryfallId: 'sf-kozilek',
      }),
      { colourIdentity: [], typeLine: 'Legendary Creature — Eldrazi' },
    );
    const identity = resolveCommanderColourIdentity(
      deck({ cards: [cmd], oracle: Object.fromEntries([entry]) }),
    );
    expect(identity).toEqual({ known: true, letters: [] });
    expect(isCardOutsideCommanderColourIdentity({ colourIdentity: [] }, identity)).toBe(false);
    expect(isCardOutsideCommanderColourIdentity({ colourIdentity: ['U'] }, identity)).toBe(true);
  });
});
