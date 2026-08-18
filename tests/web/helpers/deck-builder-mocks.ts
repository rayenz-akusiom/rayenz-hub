import { vi } from 'vitest';
import type { DeckDocument } from '@rayenz-hub/shared';

export const mockListDecks = vi.fn(async (): Promise<unknown[]> => []);
export const mockGetDeck = vi.fn(async (): Promise<DeckDocument | null> => null);
export const mockSaveDeck = vi.fn(async (doc: DeckDocument) => doc);
export const mockDeleteDeck = vi.fn(async () => undefined);
export const mockIsApiConfigured = vi.fn(() => false);
export const mockGetHubApiConfig = vi.fn(() => ({ url: '', enabled: false }));
export const mockApiListDecks = vi.fn(async (): Promise<unknown[]> => []);
export const mockApiGetDeck = vi.fn(async (): Promise<DeckDocument | null> => null);
export const mockApiPutDeck = vi.fn(async (doc: DeckDocument) => doc);
export const mockApiDeleteDeck = vi.fn(async () => undefined);
export const mockApiGetPublicDeck = vi.fn(async (): Promise<DeckDocument | null> => null);
export const mockReadProfileForDeck = vi.fn(async () => null);
