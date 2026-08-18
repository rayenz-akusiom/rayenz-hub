import { beforeEach, describe, expect, it, vi } from 'vitest';
import commander from '../../fixtures/deck-builder/commander-slice.json';

const publicApiFetch = vi.fn();

vi.mock('../../../packages/web/src/api/hub-api-client.ts', () => ({
  publicApiFetch: (...args: unknown[]) => publicApiFetch(...args),
}));

vi.mock('../../../packages/web/src/api/hub-api.ts', () => ({
  apiFetch: vi.fn(),
  isApiConfigured: () => false,
}));

import { apiGetPublicDeck, apiGetPublicSwaps } from '../../../packages/web/src/deck-builder/store/deck-api.ts';

describe('apiGetPublicDeck', () => {
  beforeEach(() => {
    publicApiFetch.mockReset();
  });

  it('returns null when the public API has no deck', async () => {
    publicApiFetch.mockResolvedValue(null);
    await expect(apiGetPublicDeck('rayenz', 'baird')).resolves.toBeNull();
  });

  it('throws when the body is not a deck document', async () => {
    publicApiFetch.mockResolvedValue({ error: 'Not found' });
    await expect(apiGetPublicDeck('rayenz', 'baird')).rejects.toThrow(
      'Public deck response was not a valid deck document',
    );
  });

  it('returns a parsed deck document', async () => {
    publicApiFetch.mockResolvedValue(commander);
    await expect(apiGetPublicDeck('rayenz', 'fixture-commander')).resolves.toMatchObject({
      name: commander.name,
      deckId: commander.deckId,
    });
  });
});

describe('apiGetPublicSwaps', () => {
  beforeEach(() => {
    publicApiFetch.mockReset();
  });

  it('returns null when the public API has no user', async () => {
    publicApiFetch.mockResolvedValue(null);
    await expect(apiGetPublicSwaps('nobody')).resolves.toBeNull();
  });

  it('throws when the body is not a swaps payload', async () => {
    publicApiFetch.mockResolvedValue({ error: 'Not found' });
    await expect(apiGetPublicSwaps('rayenz')).rejects.toThrow('Public swaps response was not valid');
  });

  it('returns parsed decks', async () => {
    publicApiFetch.mockResolvedValue({
      username: 'Rayenz',
      slug: 'rayenz',
      decks: [commander],
    });
    await expect(apiGetPublicSwaps('rayenz')).resolves.toMatchObject({
      username: 'Rayenz',
      slug: 'rayenz',
      decks: [expect.objectContaining({ name: commander.name, deckId: commander.deckId })],
    });
  });
});
