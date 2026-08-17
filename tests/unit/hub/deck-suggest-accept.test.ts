import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckDocument } from '@rayenz-hub/shared';
import {
  persistAcceptedSuggestion,
  resolveOutInstanceId,
} from '../../../packages/web/src/deck-suggest/accept.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';

const mockGetDeck = vi.fn();
const mockApiGetDeck = vi.fn();
const mockSaveDualMode = vi.fn();

vi.mock('../../../packages/web/src/deck-builder/store/deck-store', () => ({
  getDeck: (...args: unknown[]) => mockGetDeck(...args),
}));

vi.mock('../../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiGetDeck: (...args: unknown[]) => mockApiGetDeck(...args),
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
    categories: [],
    cards: [landCard('out-1', 'cmm', '1')],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as DeckDocument;
}

beforeEach(() => {
  resetHubModules();
  vi.clearAllMocks();
  mockGetDeck.mockResolvedValue(null);
  mockApiGetDeck.mockResolvedValue(null);
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

describe('persistAcceptedSuggestion', () => {
  it('persists a seeking accept to Hub', async () => {
    const deck = baseDeck();
    mockGetDeck.mockResolvedValue(deck);
    mockSaveDualMode.mockImplementation(async (next: DeckDocument) => ({ saved: next, apiError: null }));

    const saved = await persistAcceptedSuggestion(
      {
        suggestion_id: 's1',
        action: 'add',
        card: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1' },
        quantity: 1,
        roles_matched: [],
        confidence: 'high',
        rationale: '',
        tags: [],
        replaces: [],
        priority_tier: 'upgrade',
      } as never,
      {
        deck_id: 'hub-1',
        accept_kind: 'seeking',
        card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'nonfoil' },
        card_out: null,
      },
    );

    expect(saved.lookingForEntries?.length).toBe(1);
    expect(mockSaveDualMode).toHaveBeenCalled();
  });

  it('persists a swap accept to Hub', async () => {
    const deck = baseDeck();
    mockGetDeck.mockResolvedValue(deck);
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
      persistAcceptedSuggestion(
        {
          suggestion_id: 's1',
          action: 'add',
          card: { name: 'Sol Ring' },
          quantity: 1,
          roles_matched: [],
          confidence: 'high',
          rationale: '',
          tags: [],
          replaces: [],
          priority_tier: 'upgrade',
        } as never,
        {
          deck_id: 'missing',
          accept_kind: 'seeking',
          card_in: { name: 'Sol Ring' },
        },
      ),
    ).rejects.toThrow(/Save this deck to Hub/);
  });
});
