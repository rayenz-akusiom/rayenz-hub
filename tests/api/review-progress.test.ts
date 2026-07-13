import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { handleReviewProgress } from '../../packages/api/src/handlers/review-progress.ts';
import { ReviewProgressRepository } from '../../packages/api/src/repositories/review-repository.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';

const API_KEY = 'test-api-key-local';
const AUTH = { authorization: `Bearer ${API_KEY}` };

describe('review progress API', () => {
  let repo: ReviewProgressRepository;

  beforeEach(() => {
    process.env.HUB_API_KEY = API_KEY;
    repo = new ReviewProgressRepository(new MemoryDocClient(), 'HubTable');
  });

  afterEach(() => {
    delete process.env.HUB_API_KEY;
  });

  it('round-trips review progress', async () => {
    const payload = {
      decisions: { s1: 'accept', s2: 'skip' },
      currentDeckId: 'deck-1',
      currentSuggestionIndex: { 'deck-1': 2 },
    };
    const put = await handleReviewProgress('PUT', 'MSH-2026-06-21', AUTH, JSON.stringify(payload), { reviewRepo: repo });
    expect(put.statusCode).toBe(200);
    const get = await handleReviewProgress('GET', 'MSH-2026-06-21', AUTH, null, { reviewRepo: repo });
    expect(get.statusCode).toBe(200);
    const body = JSON.parse(String(get.body));
    expect(body.decisions).toEqual(payload.decisions);
    expect(body.currentSuggestionIndex).toEqual(payload.currentSuggestionIndex);
  });
});
