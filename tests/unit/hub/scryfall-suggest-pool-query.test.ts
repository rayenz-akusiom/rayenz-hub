import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCRYFALL_SUGGEST_POOL_FILTERS, fetchSetCards } from '../../../packages/shared/src/scryfall/index.ts';

describe('Scryfall suggest pool query', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('includes game:paper and format:commander filters', () => {
    expect(SCRYFALL_SUGGEST_POOL_FILTERS).toBe('game:paper format:commander');
  });

  it('fetchSetCards search URL includes paper + commander filters', async () => {
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
                legalities: { commander: 'legal' },
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
    expect(decoded).toContain('format:commander');
    expect(decoded).toContain('set:msh');
  });
});
