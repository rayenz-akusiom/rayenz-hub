import { vi } from 'vitest';
import type { DeckDocument, WantSource } from '@rayenz-hub/shared';
import { cardInstance, leanDeck } from '../../unit/helpers/deck-fixtures';

export const mockLoadSwapWantSources = vi.fn();
export const mockSaveDeck = vi.fn(async (doc: DeckDocument) => doc);
export const mockPullRemoteLibraryUpdates = vi.fn(async () => []);
export const mockApiPutDeck = vi.fn(async (doc: DeckDocument) => doc);
export const mockIsApiConfigured = vi.fn(() => false);

export function wantSource(over: Partial<WantSource> = {}): WantSource {
  return {
    deckId: 'd1',
    deckName: 'Commander Deck',
    format: 'commander',
    kind: 'queued_in',
    entryId: 'e1',
    cardInstanceId: 'c1',
    cardName: 'Sol Ring',
    mergeKey: 'sol ring',
    quantity: 1,
    usd: null,
    outInstanceId: 'o1',
    inInstanceId: 'c1',
    pairIncomplete: false,
    ...over,
  };
}

export function lookingForDeck(over: Partial<DeckDocument> = {}): DeckDocument {
  return leanDeck({
    deckId: 'cmd1',
    name: 'Commander Deck',
    categories: [],
    cards: [
      cardInstance({
        instanceId: 'c1',
        name: 'Counterspell',
        primaryCategory: 'Seeking',
        categories: ['Seeking'],
      }),
    ],
    lookingForEntries: [{ id: 'lf1', instanceId: 'c1', sortIndex: 0, notes: null }],
    ...over,
  });
}

export function pairDeck(over: Partial<DeckDocument> = {}): DeckDocument {
  return leanDeck({
    deckId: 'cmd1',
    name: 'Commander Deck',
    categories: [{ name: 'Other', includedInDeck: true, includedInPrice: true, target: null }],
    cards: [
      cardInstance({ instanceId: 'in1', name: 'Sol Ring', primaryCategory: 'Other' }),
      cardInstance({ instanceId: 'out1', name: 'Cut Card', primaryCategory: 'Other' }),
    ],
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
    ...over,
  });
}

export { cardInstance, leanDeck, emptyLibraryDeck } from '../../unit/helpers/deck-fixtures';
