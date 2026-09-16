import { describe, expect, it, vi } from 'vitest';
import { encodeTestJwt } from '../../packages/api/src/lib/jwt.ts';
import { handleReleaseSchedule } from '../../packages/api/src/handlers/release-schedule.ts';
import { handleReleaseEnsure } from '../../packages/api/src/handlers/release-ensure.ts';
import { handleSuggestReleases } from '../../packages/api/src/handlers/suggest-releases.ts';
import { runReleaseEnsure } from '../../packages/api/src/handlers/release-ensure-worker.ts';
import { SET_POOL_FORMAT_VERSION } from '../../packages/shared/src/index.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';

const friendHeaders = {
  authorization: `Bearer ${encodeTestJwt({ sub: 'friend-sub', username: 'friend' })}`,
};

describe('release schedule API', () => {
  it('GET returns empty schedule for any signed-in user', async () => {
    const { services } = createMemoryStores();
    const res = await handleReleaseSchedule('GET', friendHeaders, null, services);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    expect(body).toMatchObject({ version: 1, sets: [] });
  });

  it('PUT is owner-only and preserves worker fields on rewrite', async () => {
    const { services } = createMemoryStores();
    const denied = await handleReleaseSchedule(
      'PUT',
      friendHeaders,
      JSON.stringify({
        sets: [{ setCode: 'TLA', finalRevealDate: '2026-01-01', expectedCommanderDecks: 4 }],
      }),
      services,
    );
    expect(denied.statusCode).toBe(403);

    const put = await handleReleaseSchedule(
      'PUT',
      TEST_AUTH_HEADERS,
      JSON.stringify({
        sets: [{ setCode: 'TLA', finalRevealDate: '2026-01-01', expectedCommanderDecks: 4 }],
      }),
      services,
    );
    expect(put.statusCode).toBe(200);

    await services.releaseSchedule.replaceScheduleSets([
      {
        setCode: 'TLA',
        finalRevealDate: '2026-01-01',
        expectedCommanderDecks: 4,
        loadedCommanderDecks: 2,
        preconStatus: 'partial',
        setPoolStatus: 'ready',
      },
    ]);

    const put2 = await handleReleaseSchedule(
      'PUT',
      TEST_AUTH_HEADERS,
      JSON.stringify({
        sets: [
          {
            setCode: 'TLA',
            name: 'Avatar',
            finalRevealDate: '2026-01-01',
            expectedCommanderDecks: 5,
          },
        ],
      }),
      services,
    );
    expect(put2.statusCode).toBe(200);
    const body = JSON.parse(String(put2.body));
    expect(body.sets[0]).toMatchObject({
      setCode: 'TLA',
      name: 'Avatar',
      expectedCommanderDecks: 5,
      loadedCommanderDecks: 2,
      preconStatus: 'partial',
      setPoolStatus: 'ready',
    });
  });

  it('POST ensure returns idle when nothing due and 202 when work starts', async () => {
    const { services } = createMemoryStores();
    const idle = await handleReleaseEnsure('POST', TEST_AUTH_HEADERS, services, {
      invoke: vi.fn(),
    });
    expect(idle.statusCode).toBe(200);
    expect(JSON.parse(String(idle.body)).status).toBe('idle');

    await services.releaseSchedule.putSchedule([
      { setCode: 'TLA', finalRevealDate: '2020-01-01', expectedCommanderDecks: 1 },
    ]);

    const invoke = vi.fn(async () => undefined);
    process.env.HUB_RELEASE_ENSURE_FUNCTION_NAME = 'ReleaseEnsureFunction';
    try {
      const kicked = await handleReleaseEnsure('POST', TEST_AUTH_HEADERS, services, { invoke });
      expect(kicked.statusCode).toBe(202);
      expect(JSON.parse(String(kicked.body))).toMatchObject({
        status: 'running',
        dueSetCodes: ['TLA'],
      });
      expect(invoke).toHaveBeenCalledOnce();
      const job = await handleReleaseEnsure('GET', TEST_AUTH_HEADERS, services);
      expect(JSON.parse(String(job.body)).status).toBe('running');
    } finally {
      delete process.env.HUB_RELEASE_ENSURE_FUNCTION_NAME;
    }
  });

  it('suggest/releases merges schedule-ready sets', async () => {
    const { services } = createMemoryStores();
    await services.releaseSchedule.putSchedule([
      {
        setCode: 'ZZZSCHED',
        name: 'Schedule Only Set',
        finalRevealDate: '2020-01-01',
        expectedCommanderDecks: 0,
        setPoolStatus: 'ready',
        preconStatus: 'complete',
        loadedCommanderDecks: 0,
      },
    ]);
    const res = await handleSuggestReleases(TEST_AUTH_HEADERS, services);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    const entry = body.releases.find((r: { id: string }) => r.id === 'group:ZZZSCHED');
    expect(entry).toMatchObject({
      code: 'ZZZSCHED',
      scheduleReady: true,
      finalRevealDate: '2020-01-01',
    });
  });
});

describe('release ensure worker', () => {
  it('seeds missing precons and warms system set pool', async () => {
    const { services } = createMemoryStores();
    await services.usernameDirectory.upsert('precons', 'precons-sub');
    await services.releaseSchedule.putSchedule([
      {
        setCode: 'TLA',
        finalRevealDate: '2020-01-01',
        expectedCommanderDecks: 1,
        name: 'Avatar',
      },
    ]);

    const result = await runReleaseEnsure(services, {
      loadDeckList: async () => [
        {
          code: 'TLA',
          fileName: 'TLA_Test',
          name: 'Test Precon',
          releaseDate: '2020-01-01',
          type: 'Commander Deck',
        },
      ],
      loadDeck: async () => ({
        code: 'TLA',
        name: 'Test Precon',
        commander: [
          {
            name: 'Aang',
            count: 1,
            types: ['Creature'],
            colorIdentity: ['W'],
            identifiers: { scryfallId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          },
        ],
        mainBoard: [],
      }),
      fetchSetCards: async () => ({
        set_codes: ['TLA'],
        primary_set_code: 'TLA',
        product_name: 'Avatar',
        cards: [{ name: 'Aang', set: 'tla' }],
      }),
      now: () => new Date('2026-01-15T00:00:00.000Z'),
    });

    expect(result.processed).toBe(1);
    const decks = await services.deckRepository.listByUserId('precons-sub');
    expect(decks.some((d) => d.deckId === 'precon-TLA_Test')).toBe(true);
    const pool = await services.setPoolRepository.getSystem('TLA');
    expect(pool?.cards.length).toBe(1);
    expect(pool?.formatVersion).toBe(SET_POOL_FORMAT_VERSION);

    const schedule = await services.releaseSchedule.getSchedule();
    expect(schedule.sets[0]).toMatchObject({
      setCode: 'TLA',
      preconStatus: 'complete',
      loadedCommanderDecks: 1,
      setPoolStatus: 'ready',
    });
    const job = await services.releaseSchedule.getJob();
    expect(job.status).toBe('complete');
  });
});
