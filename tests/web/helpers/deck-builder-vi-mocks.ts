/**
 * Side-effect mock registration for deck-builder app/shell suites.
 * Import before the app under test.
 */
import { vi } from 'vitest';
import type { DeckDocument } from '@rayenz-hub/shared';
import {
  mockApiDeleteDeck,
  mockApiGetDeck,
  mockApiGetPublicDeck,
  mockApiListDecks,
  mockApiPutDeck,
  mockDeleteDeck,
  mockGetDeck,
  mockGetHubApiConfig,
  mockIsApiConfigured,
  mockListDecks,
  mockReadProfileForDeck,
  mockSaveDeck,
} from './deck-builder-mocks';

vi.mock('../../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => mockIsApiConfigured(),
  getHubApiConfig: () => mockGetHubApiConfig(),
}));

vi.mock('../../../packages/web/src/deck-builder/store/deck-store', () => ({
  listDecks: () => mockListDecks(),
  getDeck: (id: string) => mockGetDeck(id),
  saveDeck: (doc: DeckDocument) => mockSaveDeck(doc),
  deleteDeck: (id: string) => mockDeleteDeck(id),
}));

vi.mock('../../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiListDecks: () => mockApiListDecks(),
  apiGetDeck: (id: string) => mockApiGetDeck(id),
  apiPutDeck: (doc: DeckDocument) => mockApiPutDeck(doc),
  apiDeleteDeck: (id: string) => mockApiDeleteDeck(id),
  apiGetPublicDeck: (username: string, slug: string) => mockApiGetPublicDeck(username, slug),
}));

vi.mock('../../../packages/web/src/deck-builder/scryfall/useScryfallEnrich', () => ({
  useScryfallEnrich: () => ({ enriching: false }),
}));

vi.mock('../../../packages/web/src/mtg/profile-sync', () => ({
  ProfileSync: {
    readProfileYaml: vi.fn(async () => null),
    writeProfileYaml: vi.fn(async () => undefined),
  },
}));

vi.mock('../../../packages/web/src/deck-suggest/data', () => ({
  readProfileForDeck: (...args: unknown[]) => mockReadProfileForDeck(...args),
}));