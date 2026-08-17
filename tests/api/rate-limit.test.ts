import { describe, expect, it } from 'vitest';
import { handleAuthSignIn } from '../../packages/api/src/handlers/auth-sign-in.ts';
import { createMemoryStores } from './helpers/test-services.ts';

describe('rate limits', () => {
  it('returns 429 after too many sign-in attempts', async () => {
    const { services } = createMemoryStores();
    let last = 200;
    for (let i = 0; i < 21; i++) {
      const res = await handleAuthSignIn(
        { 'x-forwarded-for': '203.0.113.9' },
        JSON.stringify({ username: 'Rayenz', password: 'wrong' }),
        services,
      );
      last = res.statusCode ?? 0;
    }
    expect(last).toBe(429);
  });
});
