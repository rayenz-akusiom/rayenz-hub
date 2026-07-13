import { describe, expect, it } from 'vitest';
import { handleReviewProgress } from '../../packages/api/src/handlers/review-progress.ts';
import { ReviewProgressRepository } from '../../packages/api/src/repositories/review-repository.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';
import { TEST_AUTH_HEADERS, createTestServices } from './helpers/test-services.ts';

describe('review progress API', () => {
  it('round-trips review progress', async () => {
    const memory = new MemoryDocClient();
    const services = createTestServices({
      reviewProgressRepository: new ReviewProgressRepository(memory, 'HubTable'),
    });
    const payload = {
      decisions: { s1: 'accept', s2: 'skip' },
      currentDeckId: 'deck-1',
      currentSuggestionIndex: { 'deck-1': 2 },
    };
    const put = await handleReviewProgress('PUT', 'MSH-2026-06-21', TEST_AUTH_HEADERS, JSON.stringify(payload), services);
    expect(put.statusCode).toBe(200);
    const get = await handleReviewProgress('GET', 'MSH-2026-06-21', TEST_AUTH_HEADERS, null, services);
    expect(get.statusCode).toBe(200);
    const body = JSON.parse(String(get.body));
    expect(body.decisions).toEqual(payload.decisions);
    expect(body.currentSuggestionIndex).toEqual(payload.currentSuggestionIndex);
  });
});
