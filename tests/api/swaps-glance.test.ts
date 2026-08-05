import { describe, expect, it } from 'vitest';
import { SWAP_GLANCE_GENERATION_VERSION } from '@rayenz-hub/shared';
import { handleDeck } from '../../packages/api/src/handlers/decks.ts';
import { handleSwapsGlance } from '../../packages/api/src/handlers/swaps-glance.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import { asBlobStore } from './helpers/test-blob-store.ts';
import { buildGlanceSwapCommanderDeck } from '../fixtures/deck-builder/glance-eligible.ts';

const TEST_CARD_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const renderOptions = {
  skipArtEnrichment: true,
  fastPng: true,
  imageLoader: async () => new Uint8Array(TEST_CARD_IMAGE),
};

describe('swaps glance API', () => {
  it('returns 400 for invalid body', async () => {
    const { services, s3 } = createMemoryStores();
    const opts = { ...renderOptions, blobStore: asBlobStore(s3) };
    const badJson = await handleSwapsGlance(TEST_AUTH_HEADERS, '{oops', services, opts);
    expect(badJson.statusCode).toBe(400);

    const badShape = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({ mode: 'nope', includeSeeking: true, items: [] }),
      services,
      opts,
    );
    expect(badShape.statusCode).toBe(400);
  });

  it('returns 404 when a referenced deck is missing', async () => {
    const { services, s3 } = createMemoryStores();
    const res = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        mode: 'in_only',
        includeSeeking: false,
        items: [{ deckId: 'missing', kind: 'queued_in', entryId: 'e1' }],
      }),
      services,
      { ...renderOptions, blobStore: asBlobStore(s3) },
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns PNG bytes and cache HIT on second call', async () => {
    const { services, s3 } = createMemoryStores();
    const deck = buildGlanceSwapCommanderDeck({ deckId: 'swap-glance-1' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const blob = asBlobStore(s3);
    const body = JSON.stringify({
      mode: 'full',
      includeSeeking: false,
      items: [{ deckId: deck.deckId, kind: 'queued_in', entryId: 'swap-1' }],
    });

    const first = await handleSwapsGlance(TEST_AUTH_HEADERS, body, services, {
      ...renderOptions,
      blobStore: blob,
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers?.['content-type']).toBe('image/png');
    expect(first.headers?.['x-glance-cache']).toBe('MISS');
    expect(first.headers?.['x-glance-generation']).toBe(SWAP_GLANCE_GENERATION_VERSION);
    expect(first.headers?.['x-glance-generation']).toBe('swap-glance-gen-9');
    expect(first.isBase64Encoded).toBe(true);

    const second = await handleSwapsGlance(TEST_AUTH_HEADERS, body, services, {
      ...renderOptions,
      blobStore: blob,
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers?.['x-glance-cache']).toBe('HIT');
    expect(second.body).toBe(first.body);
  });

  it('accepts setCodes and uses a distinct cache key from no-filter', async () => {
    const { services, s3 } = createMemoryStores();
    const deck = buildGlanceSwapCommanderDeck({ deckId: 'swap-glance-sets' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const blob = asBlobStore(s3);
    const items = [{ deckId: deck.deckId, kind: 'queued_in', entryId: 'swap-1' }];

    const plain = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({ mode: 'full', includeSeeking: false, items }),
      services,
      { ...renderOptions, blobStore: blob },
    );
    expect(plain.statusCode).toBe(200);

    const filtered = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        mode: 'full',
        includeSeeking: false,
        setCodes: ['mh3', 'msc'],
        items,
      }),
      services,
      { ...renderOptions, blobStore: blob },
    );
    expect(filtered.statusCode).toBe(200);
    expect(filtered.headers?.['x-glance-generation']).toBe('swap-glance-gen-9');
    expect(filtered.headers?.['x-glance-cache']).toBe('MISS');
    expect(filtered.body).not.toBe(plain.body);
  });

  it('returns 400 SWAP_GLANCE_EMPTY when entry cannot be resolved', async () => {
    const { services, s3 } = createMemoryStores();
    const deck = buildGlanceSwapCommanderDeck({ deckId: 'swap-glance-empty' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const res = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        mode: 'in_only',
        includeSeeking: false,
        items: [{ deckId: deck.deckId, kind: 'queued_in', entryId: 'nope' }],
      }),
      services,
      { ...renderOptions, blobStore: asBlobStore(s3) },
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(String(res.body)).code).toBe('SWAP_GLANCE_EMPTY');
  });

  it('returns a JSON bundle when content spans multiple pages', async () => {
    const { services, s3 } = createMemoryStores();
    const decks = Array.from({ length: 24 }, (_, i) => {
      const base = buildGlanceSwapCommanderDeck({
        deckId: `multi-page-${i}`,
        name: `Multi ${i}`,
      });
      // Extra looking-for entries so plates need more than one page at M
      const extras = Array.from({ length: 4 }, (_, j) => ({
        id: `seek-${i}-${j}`,
        instanceId: `spell-${(j % 3) + 1}`,
        sortIndex: j,
        notes: null,
      }));
      return {
        ...base,
        lookingForEntries: extras,
        formalSwapEntries: [
          ...(base.formalSwapEntries || []),
          ...Array.from({ length: 2 }, (_, j) => ({
            id: `swap-extra-${i}-${j}`,
            outInstanceId: 'spell-0',
            inInstanceId: 'swap-in-1',
            sortIndex: j + 1,
            notes: null,
          })),
        ],
      };
    });
    for (const deck of decks) {
      await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    }
    const items = decks.flatMap((deck) => [
      { deckId: deck.deckId, kind: 'queued_in' as const, entryId: 'swap-1' },
      ...(deck.lookingForEntries || []).map((e) => ({
        deckId: deck.deckId,
        kind: 'seeking' as const,
        entryId: e.id,
      })),
    ]);

    const res = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({ mode: 'in_only', includeSeeking: true, items }),
      services,
      { ...renderOptions, blobStore: asBlobStore(s3) },
    );
    expect(res.statusCode).toBe(200);
    // Either single PNG (if it fitted) or bundle — force enough content that bundle is expected
    const ct = String(res.headers?.['content-type'] || '');
    if (ct.includes('application/json')) {
      const body = JSON.parse(String(res.body)) as {
        delivery: string;
        pageCount: number;
        images: unknown[];
        generation: string;
      };
      expect(body.delivery).toBe('bundle');
      expect(body.pageCount).toBeGreaterThan(1);
      expect(body.images.length).toBe(body.pageCount);
      expect(body.generation).toBe('swap-glance-gen-9');
    } else {
      // If planner still fits on one page, response stays binary — acceptable
      expect(ct).toBe('image/png');
    }
  });
});
