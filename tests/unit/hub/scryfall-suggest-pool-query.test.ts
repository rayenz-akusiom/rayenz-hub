import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SCRYFALL_SET_POOL_FILTERS,
  SCRYFALL_SUGGEST_POOL_FILTERS,
  fetchSetCards,
} from '../../../packages/shared/src/scryfall/index.ts';

describe('Scryfall suggest pool query', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps format:commander on live Suggest upgrade filters only', () => {
    expect(SCRYFALL_SUGGEST_POOL_FILTERS).toBe('game:paper format:commander');
    expect(SCRYFALL_SET_POOL_FILTERS).toBe('game:paper');
  });

  it('fetchSetCards search URL includes paper but not format:commander', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/sets/')) {
          return {
            ok: true,
            json: async () => ({
              object: 'set',
              code: 'msh',
              name: 'Marvel Super Heroes',
              scryfall_uri: null,
              card_count: 1,
              released_at: '2026-01-01',
              set_type: 'expansion',
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            object: 'list',
            data: [
              {
                id: 'id-1',
                name: 'Take Up the Shield',
                set: 'msh',
                collector_number: '39',
                type_line: 'Instant',
                oracle_text: 'indestructible',
                color_identity: ['W'],
                legalities: { commander: 'not_legal' },
              },
            ],
          }),
        };
      }),
    );

    const result = await fetchSetCards(['MSH'], { dedupe: true });
    expect(result.cards).toHaveLength(1);
    const searchUrl = urls.find((u) => u.includes('/cards/search'));
    expect(searchUrl).toBeTruthy();
    const decoded = decodeURIComponent(searchUrl!);
    expect(decoded).toContain('game:paper');
    expect(decoded).not.toContain('format:commander');
    expect(decoded).toContain('set:msh');
  });
});
