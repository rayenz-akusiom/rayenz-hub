import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckDocument } from '@rayenz-hub/shared';
import {
  buildAddAcceptPatch,
  persistAcceptedSuggestion,
  resolveOutInstanceId,
} from '../../../packages/web/src/deck-suggest/accept.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';

const mockResolveLibraryDocument = vi.fn();
const mockSaveDualMode = vi.fn();

vi.mock('../../../packages/web/src/deck-builder/store/library-sync', () => ({
  resolveLibraryDocument: (...args: unknown[]) => mockResolveLibraryDocument(...args),
}));

vi.mock('../../../packages/web/src/deck-builder/store/deck-dual-mode', () => ({
  saveDualMode: (...args: unknown[]) => mockSaveDualMode(...args),
}));

function landCard(instanceId: string, setCode: string, collectorNumber: string) {
  return {
    instanceId,
    name: 'Plains',
    quantity: 1,
    primaryCategory: 'Land',
    categories: ['Land'],
    stack: null,
    setCode,
    collectorNumber,
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
  };
}

function baseDeck(overrides: Partial<DeckDocument> = {}): DeckDocument {
  return {
    schemaVersion: 1,
    deckId: 'hub-1',
    name: 'Test',
    format: 'commander',
    archidektId: null,
    archidektUrl: '',
    categories: [
      { name: 'Land', includedInDeck: true, includedInPrice: true, target: null },
      { name: 'Creature', includedInDeck: true, includedInPrice: true, target: null },
    ],
    cards: [landCard('out-1', 'cmm', '1')],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as DeckDocument;
}

const addSuggestion = {
  suggestion_id: 's1',
  action: 'add',
  card: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', scryfall_id: 'sr-id' },
  quantity: 1,
  roles_matched: [],
  confidence: 'high',
  rationale: '',
  tags: [],
  replaces: [],
  priority_tier: 'upgrade',
} as never;

beforeEach(() => {
  resetHubModules();
  vi.clearAllMocks();
  mockResolveLibraryDocument.mockResolvedValue(null);
  mockSaveDualMode.mockResolvedValue({ saved: baseDeck(), apiError: null });
});

describe('resolveOutInstanceId', () => {
  it('matches by set and collector when available', () => {
    const deck = baseDeck({
      cards: [landCard('a', 'cmm', '1'), landCard('b', 'mh3', '9')],
    });
    expect(resolveOutInstanceId(deck, { name: 'Plains', set_code: 'cmm', collector_number: '1' })).toBe('a');
    expect(resolveOutInstanceId(deck, { name: 'Plains', set_code: 'mh3', collector_number: '9' })).toBe('b');
  });

  it('falls back to first name match', () => {
    const deck = baseDeck();
    expect(resolveOutInstanceId(deck, { name: 'Plains' })).toBe('out-1');
    expect(resolveOutInstanceId(deck, { name: 'Missing' })).toBe(null);
  });
});

describe('buildAddAcceptPatch', () => {
  it('adds to Maybeboard with no formal swap or Seeking entry', () => {
    const deck = baseDeck();
    const patch = buildAddAcceptPatch(deck, addSuggestion, 'maybeboard');
    expect(patch.cardOps).toHaveLength(1);
    expect(patch.cardOps![0]).toMatchObject({
      op: 'add',
      card: {
        name: 'Sol Ring',
        primaryCategory: 'Maybeboard',
        categories: ['Maybeboard'],
      },
    });
    expect(patch.formalSwapOps).toBeUndefined();
    expect(patch.lookingForOps).toBeUndefined();
  });

  it('adds to default swap-in category when destination is deck and type line is unknown', () => {
    const deck = baseDeck();
    const patch = buildAddAcceptPatch(deck, addSuggestion, 'deck');
    expect(patch.cardOps![0]).toMatchObject({
      op: 'add',
      card: {
        name: 'Sol Ring',
        primaryCategory: 'Land',
        categories: ['Land'],
      },
    });
  });

  it('files by type line when printing includes typeLine', () => {
    const deck = baseDeck();
    const patch = buildAddAcceptPatch(deck, addSuggestion, 'deck', {
      printing: {
        name: 'Sol Ring',
        scryfallId: 'sr-id',
        setCode: 'cmm',
        collectorNumber: '1',
        typeLine: 'Artifact',
        colourIdentity: [],
        layout: 'normal',
        foil: false,
        printedName: null,
        flavorName: null,
        manaValue: 1,
      },
    });
    expect(patch.cardOps![0]).toMatchObject({
      op: 'add',
      card: {
        name: 'Sol Ring',
        primaryCategory: 'Artifact',
      },
    });
  });

  it('clears matching Seeking entries for the same name', () => {
    const deck = baseDeck({
      cards: [
        landCard('out-1', 'cmm', '1'),
        {
          instanceId: 'seek-1',
          name: 'Sol Ring',
          quantity: 1,
          primaryCategory: 'Seeking',
          categories: ['Seeking'],
          stack: null,
          setCode: null,
          collectorNumber: null,
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
      ],
      lookingForEntries: [{ id: 'lf-1', instanceId: 'seek-1', sortIndex: 0, notes: null }],
    } as Partial<DeckDocument>);
    const patch = buildAddAcceptPatch(deck, addSuggestion, 'deck');
    expect(patch.lookingForOps).toEqual([{ op: 'remove', id: 'lf-1' }]);
  });
});

describe('persistAcceptedSuggestion', () => {
  it('persists a seeking accept to Hub', async () => {
    const deck = baseDeck();
    mockResolveLibraryDocument.mockResolvedValue(deck);
    mockSaveDualMode.mockImplementation(async (next: DeckDocument) => ({ saved: next, apiError: null }));

    const saved = await persistAcceptedSuggestion(addSuggestion, {
      deck_id: 'hub-1',
      accept_kind: 'seeking',
      card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'nonfoil' },
      card_out: null,
    });

    expect(saved.lookingForEntries?.length).toBe(1);
    expect(mockSaveDualMode).toHaveBeenCalled();
  });

  it('persists an add accept to Hub without Seeking when card_out is empty', async () => {
    const deck = baseDeck();
    mockResolveLibraryDocument.mockResolvedValue(deck);
    mockSaveDualMode.mockImplementation(async (next: DeckDocument) => ({ saved: next, apiError: null }));

    const saved = await persistAcceptedSuggestion(addSuggestion, {
      deck_id: 'hub-1',
      accept_kind: 'add',
      add_destination: 'maybeboard',
      card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'nonfoil' },
      card_out: null,
    });

    expect(saved.lookingForEntries?.length ?? 0).toBe(0);
    expect(saved.formalSwapEntries?.length ?? 0).toBe(0);
    const added = saved.cards.find((c) => c.name === 'Sol Ring');
    expect(added?.primaryCategory).toBe('Maybeboard');
  });

  it('persists a deck add accept to Hub', async () => {
    const deck = baseDeck();
    mockResolveLibraryDocument.mockResolvedValue(deck);
    mockSaveDualMode.mockImplementation(async (next: DeckDocument) => ({ saved: next, apiError: null }));

    const saved = await persistAcceptedSuggestion(addSuggestion, {
      deck_id: 'hub-1',
      accept_kind: 'add',
      add_destination: 'deck',
      card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'nonfoil' },
      card_out: null,
    });

    const added = saved.cards.find((c) => c.name === 'Sol Ring');
    expect(added?.primaryCategory).toBe('Land');
    expect(saved.lookingForEntries?.length ?? 0).toBe(0);
  });

  it('persists a swap accept to Hub', async () => {
    const deck = baseDeck();
    mockResolveLibraryDocument.mockResolvedValue(deck);
    mockSaveDualMode.mockImplementation(async (next: DeckDocument) => ({ saved: next, apiError: null }));

    const saved = await persistAcceptedSuggestion(
      {
        suggestion_id: 's1',
        action: 'replace',
        card: { name: "Caretaker's Talent", set_code: 'blb', collector_number: '6' },
        quantity: 1,
        roles_matched: [],
        confidence: 'high',
        rationale: '',
        tags: [],
        replaces: [{ name: 'Plains', quantity: 1 }],
        priority_tier: 'swap',
      } as never,
      {
        deck_id: 'hub-1',
        accept_kind: 'swap',
        card_in: {
          name: "Caretaker's Talent",
          set_code: 'blb',
          collector_number: '6',
          finish: 'nonfoil',
        },
        card_out: { name: 'Plains', set_code: 'cmm', collector_number: '1' },
      },
    );

    expect(saved.formalSwapEntries?.length).toBe(1);
    expect(mockSaveDualMode).toHaveBeenCalled();
  });

  it('throws when Hub deck is missing', async () => {
    await expect(
      persistAcceptedSuggestion(addSuggestion, {
        deck_id: 'missing',
        accept_kind: 'seeking',
        card_in: { name: 'Sol Ring' },
      }),
    ).rejects.toThrow(/Save this deck to Hub/);
  });
});
