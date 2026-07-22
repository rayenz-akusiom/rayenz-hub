import { describe, it, expect } from 'vitest';
import {
  applyLookingForToCards,
  normalizeLookingForEntries,
  seedLookingForFromCategories,
  syncCardsWithLookingFor,
} from '../../../packages/shared/src/deck-builder/looking-for.ts';
import { buildArchidektImportText } from '../../../packages/shared/src/mtg/archidekt-import-text.ts';
import type { DeckDocument } from '../../../packages/shared/src/schemas/deck-builder.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

function baseDeck(over: Partial<DeckDocument> = {}): DeckDocument {
  return {
    schemaVersion: 1,
    deckId: 'd1',
    name: 'Test',
    format: 'commander',
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards: commander.cards as DeckDocument['cards'],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    ...over,
  };
}

describe('looking-for', () => {
  it('normalizes sortIndex', () => {
    const entries = normalizeLookingForEntries([
      { id: 'b', instanceId: 'c1', sortIndex: 5, notes: null },
      { id: 'a', instanceId: 'c2', sortIndex: 1, notes: null },
    ]);
    expect(entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(entries[0].sortIndex).toBe(0);
    expect(entries[1].sortIndex).toBe(1);
  });

  it('sync sets Seeking primary and category def', () => {
    const { deck, warnings } = syncCardsWithLookingFor(
      baseDeck(),
      [{ id: 'lf1', instanceId: 'c1', sortIndex: 0, notes: null }],
    );
    expect(warnings).toEqual([]);
    const card = deck.cards.find((c) => c.instanceId === 'c1')!;
    expect(card.primaryCategory).toBe('Seeking');
    expect(deck.categories.some((c) => c.name === 'Seeking' && !c.includedInDeck)).toBe(true);
  });

  it('prefers formal swap over Seeking on conflict', () => {
    const { deck, warnings } = syncCardsWithLookingFor(
      baseDeck({
        formalSwapEntries: [
          {
            id: 's1',
            inInstanceId: 'c1',
            outInstanceId: 'c2',
            inTargetCategory: null,
            sortIndex: 0,
            notes: null,
          },
        ],
      }),
      [{ id: 'lf1', instanceId: 'c1', sortIndex: 0, notes: null }],
    );
    expect(deck.lookingForEntries).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('seeds from Seeking category and not Maybeboard', () => {
    const cards = [
      {
        ...commander.cards[0],
        instanceId: 'lf1',
        primaryCategory: 'Seeking',
        categories: ['Seeking'],
      },
      {
        ...commander.cards[1],
        instanceId: 'mb1',
        primaryCategory: 'Maybeboard',
        categories: ['Maybeboard'],
      },
    ];
    const seeded = seedLookingForFromCategories(cards as DeckDocument['cards'], []);
    expect(seeded).toHaveLength(1);
    expect(seeded[0].instanceId).toBe('lf1');
  });

  it('preserves existing entry ids on reseed', () => {
    const cards = [
      {
        ...commander.cards[0],
        instanceId: 'lf1',
        primaryCategory: 'Seeking',
        categories: ['Seeking'],
      },
    ];
    const seeded = seedLookingForFromCategories(cards as DeckDocument['cards'], [
      { id: 'keep-me', instanceId: 'lf1', sortIndex: 0, notes: 'n' },
    ]);
    expect(seeded[0].id).toBe('keep-me');
    expect(seeded[0].notes).toBe('n');
  });

  it('seeds from legacy Looking For category name', () => {
    const cards = [
      {
        ...commander.cards[0],
        instanceId: 'lf1',
        primaryCategory: 'Looking For',
        categories: ['Looking For'],
      },
    ];
    const seeded = seedLookingForFromCategories(cards as DeckDocument['cards'], []);
    expect(seeded).toHaveLength(1);
    expect(seeded[0].instanceId).toBe('lf1');
  });

  it('export applies Seeking with noDeck/noPrice flags', () => {
    const cards = applyLookingForToCards(
      commander.cards as DeckDocument['cards'],
      [{ id: 'lf1', instanceId: 'c1', sortIndex: 0, notes: null }],
      'commander',
    );
    expect(cards.find((c) => c.instanceId === 'c1')!.primaryCategory).toBe('Seeking');

    const text = buildArchidektImportText(
      baseDeck({
        lookingForEntries: [{ id: 'lf1', instanceId: 'c1', sortIndex: 0, notes: null }],
        cards: commander.cards as DeckDocument['cards'],
      }),
    );
    expect(text).toMatch(/Seeking\{noDeck\}\{noPrice\}/);
  });
});
