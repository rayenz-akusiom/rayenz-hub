import { describe, it, expect } from 'vitest';
import {
  aggregateSwapWants,
  redactDeckForPublicSwaps,
  unifyWantSources,
  type WantSource,
} from '../../../packages/shared/src/mtg/wants-aggregate.ts';
import { emptyCardOracle } from '../../../packages/shared/src/deck-builder/card-oracle.ts';
import type { DeckDocument } from '../../../packages/shared/src/schemas/deck-builder.ts';

function card(
  instanceId: string,
  name: string,
  qty = 1,
): DeckDocument['cards'][number] {
  return {
    instanceId,
    name,
    quantity: qty,
    primaryCategory: 'Other',
    categories: ['Other'],
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
  };
}

function deck(partial: Partial<DeckDocument> & Pick<DeckDocument, 'deckId' | 'name' | 'format'>): DeckDocument {
  return {
    schemaVersion: 1,
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards: [],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    ...partial,
  };
}

describe('wants-aggregate', () => {
  it('aggregates Queued In, Out, and Seeking from commander and cube only', () => {
    const decks = [
      deck({
        deckId: 'cmd',
        name: 'Commander Deck',
        format: 'commander',
        cards: [card('in1', 'Sol Ring'), card('out1', 'Cut Card')],
        formalSwapEntries: [
          {
            id: 's1',
            inInstanceId: 'in1',
            outInstanceId: 'out1',
            inTargetCategory: null,
            sortIndex: 0,
            notes: null,
          },
        ],
      }),
      deck({
        deckId: 'cube',
        name: 'Cube',
        format: 'cube',
        cards: [card('lf1', 'Counterspell')],
        lookingForEntries: [{ id: 'lf1', instanceId: 'lf1', sortIndex: 0, notes: null }],
      }),
      deck({
        deckId: 'other',
        name: 'Other',
        format: 'other',
        cards: [card('x', 'Ignored')],
        lookingForEntries: [{ id: 'x', instanceId: 'x', sortIndex: 0, notes: null }],
      }),
    ];

    const sources = aggregateSwapWants(decks);
    expect(sources).toHaveLength(3);
    expect(sources.map((s) => s.kind).sort()).toEqual(['queued_in', 'queued_out', 'seeking']);
    expect(sources.find((s) => s.kind === 'queued_in')!.cardName).toBe('Sol Ring');
    expect(sources.find((s) => s.kind === 'queued_out')!.cardName).toBe('Cut Card');
    expect(sources.find((s) => s.kind === 'seeking')!.deckName).toBe('Cube');
  });

  it('unifies by mergeKey and sums quantities', () => {
    const sources: WantSource[] = [
      {
        deckId: 'a',
        deckName: 'A',
        format: 'commander',
        kind: 'queued_in',
        entryId: '1',
        cardInstanceId: 'c1',
        cardName: 'Sol Ring',
        mergeKey: 'sol ring',
        quantity: 1,
        usd: 1,
        setCode: null,
        collectorNumber: null,
        foil: false,
        outInstanceId: null,
        inInstanceId: 'c1',
        pairIncomplete: true,
      },
      {
        deckId: 'b',
        deckName: 'B',
        format: 'cube',
        kind: 'seeking',
        entryId: '2',
        cardInstanceId: 'c2',
        cardName: 'Sol Ring',
        mergeKey: 'sol ring',
        quantity: 2,
        usd: 3,
        setCode: null,
        collectorNumber: null,
        foil: false,
        outInstanceId: null,
        inInstanceId: null,
        pairIncomplete: false,
      },
    ];
    const rows = unifyWantSources(sources);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalQuantity).toBe(3);
    expect(rows[0].displayName).toBe('Sol Ring');
    expect(rows[0].minUsd).toBe(1);
    expect(rows[0].maxUsd).toBe(3);
  });

  it('uses printing-sought display while merging on canonical name', () => {
    const d = deck({
      deckId: 'cmd',
      name: 'UB',
      format: 'commander',
      cards: [card('a1', 'Mind Flayer')],
      oracle: {
        'name:mind flayer': {
          scryfallId: null,
          colourIdentity: [],
          typeLine: null,
          layout: null,
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: 'The Arvinox, the Mind Flayer',
          flavorName: null,
          manaValue: null,
          imageUrl: null,
          finishes: null,
          updatedAt: null,
        },
      },
      lookingForEntries: [{ id: 'lf', instanceId: 'a1', sortIndex: 0, notes: null }],
    });

    const d2 = deck({
      deckId: 'cube',
      name: 'Cube',
      format: 'cube',
      cards: [card('b1', 'Mind Flayer')],
      oracle: {
        'name:mind flayer': {
          scryfallId: null,
          colourIdentity: [],
          typeLine: null,
          layout: null,
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: 'The Arvinox, the Mind Flayer',
          flavorName: null,
          manaValue: null,
          imageUrl: null,
          finishes: null,
          updatedAt: null,
        },
      },
      lookingForEntries: [{ id: 'lf2', instanceId: 'b1', sortIndex: 0, notes: null }],
    });

    const sources = aggregateSwapWants([d, d2]);
    expect(sources.every((s) => s.mergeKey === 'mind flayer')).toBe(true);
    expect(sources.every((s) => s.cardName === 'The Arvinox, the Mind Flayer')).toBe(true);
    const rows = unifyWantSources(sources);
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe('The Arvinox, the Mind Flayer');
    expect(rows[0].totalQuantity).toBe(2);
  });

  it('skips Theory decks even when they have queues', () => {
    const owned = deck({
      deckId: 'owned',
      name: 'Owned',
      format: 'commander',
      ownership: 'owned',
      cards: [card('in1', 'Sol Ring'), card('out1', 'Cut')],
      formalSwapEntries: [
        {
          id: 's1',
          inInstanceId: 'in1',
          outInstanceId: 'out1',
          inTargetCategory: null,
          sortIndex: 0,
          notes: null,
        },
      ],
    });
    const theory = deck({
      deckId: 'theory',
      name: 'Theory',
      format: 'commander',
      ownership: 'theory',
      cards: [card('in2', 'Mana Crypt'), card('out2', 'Cut2')],
      formalSwapEntries: [
        {
          id: 's2',
          inInstanceId: 'in2',
          outInstanceId: 'out2',
          inTargetCategory: null,
          sortIndex: 0,
          notes: null,
        },
      ],
      lookingForEntries: [{ id: 'lf', instanceId: 'in2', sortIndex: 0, notes: null }],
    });

    const sources = aggregateSwapWants([owned, theory]);
    expect(sources.every((s) => s.deckId === 'owned')).toBe(true);
    expect(sources).toHaveLength(2);
  });

  it('redactDeckForPublicSwaps keeps queue cards and drops the rest', () => {
    const full = deck({
      deckId: 'cmd',
      name: 'Commander Deck',
      format: 'commander',
      cards: [
        card('in1', 'Sol Ring'),
        card('out1', 'Cut Card'),
        card('lf1', 'Counterspell'),
        card('main', 'Island'),
      ],
      oracle: {
        'name:sol ring': emptyCardOracle({ scryfallId: 'sol' }),
        'name:island': emptyCardOracle({ scryfallId: 'island', colourIdentity: ['U'], typeLine: 'Basic Land' }),
      },
      formalSwapEntries: [
        {
          id: 's1',
          inInstanceId: 'in1',
          outInstanceId: 'out1',
          inTargetCategory: null,
          sortIndex: 0,
          notes: null,
        },
      ],
      lookingForEntries: [{ id: 'lf1', instanceId: 'lf1', sortIndex: 0, notes: null }],
    });
    const redacted = redactDeckForPublicSwaps(full);
    expect(redacted.cards.map((c) => c.instanceId).sort()).toEqual(['in1', 'lf1', 'out1']);
    expect(redacted.oracle['name:sol ring']?.scryfallId).toBe('sol');
    expect(redacted.oracle['name:island']).toBeUndefined();
    expect(redacted.formalSwapEntries).toHaveLength(1);
    expect(redacted.lookingForEntries).toHaveLength(1);
  });
});
