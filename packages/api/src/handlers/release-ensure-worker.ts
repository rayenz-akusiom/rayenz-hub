/**
 * Release-ensure worker: seed due MTGJSON Commander precons + warm SYSTEM set pools.
 * Invoked async from Hub API or by daily EventBridge schedule.
 */
import {
  PRECONS_USERNAME,
  RELEASE_ENSURE_JOB_ID,
  SET_POOL_FORMAT_VERSION,
  buildPreconFromMtgjson,
  filterCommanderDecksForSet,
  listDueReleaseScheduleSets,
  loadMtgjsonCommanderDeckList,
  loadMtgjsonDeck,
  normalizeSetCodesKey,
  uniquifyMtgjsonDeckNames,
  fetchSetCards,
  type ReleaseScheduleSet,
} from '@rayenz-hub/shared';
import { createDocClient } from '../repositories/settings-repository.js';
import { createS3Client, S3BlobStore } from '../repositories/s3-blob-store.js';
import { DeckRepository } from '../repositories/deck-repository.js';
import { SetPoolRepository } from '../repositories/set-pool-repository.js';
import { UsernameDirectory } from '../repositories/username-directory.js';
import { UsernameDirectoryService } from '../services/username-directory-service.js';
import { ReleaseScheduleService } from '../services/release-schedule.js';
import { readEnv } from '../lib/auth.js';
import type { AppServices } from '../ioc/index.js';

const USER_AGENT = 'rayenz-hub-release-ensure/1.0';
const REQUEST_DELAY_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ReleaseEnsureWorkerDeps = {
  loadDeckList?: typeof loadMtgjsonCommanderDeckList;
  loadDeck?: typeof loadMtgjsonDeck;
  fetchSetCards?: typeof fetchSetCards;
  now?: () => Date;
};

export async function runReleaseEnsure(
  services: AppServices,
  deps: ReleaseEnsureWorkerDeps = {},
): Promise<{ ok: true; processed: number }> {
  const nowFn = deps.now || (() => new Date());
  const loadList = deps.loadDeckList || loadMtgjsonCommanderDeckList;
  const loadDeck = deps.loadDeck || loadMtgjsonDeck;
  const fetchCards = deps.fetchSetCards || fetchSetCards;

  const started = nowFn().toISOString();
  const schedule = await services.releaseSchedule.getSchedule();
  const due = listDueReleaseScheduleSets(schedule, nowFn());

  if (!due.length) {
    await services.releaseSchedule.putJob({
      jobId: RELEASE_ENSURE_JOB_ID,
      status: 'complete',
      startedAt: started,
      finishedAt: nowFn().toISOString(),
      current: 0,
      total: 0,
      label: 'Nothing due',
      error: null,
      updatedAt: nowFn().toISOString(),
    });
    return { ok: true, processed: 0 };
  }

  await services.releaseSchedule.putJob({
    jobId: RELEASE_ENSURE_JOB_ID,
    status: 'running',
    startedAt: started,
    current: 0,
    total: due.length,
    label: `Ensuring ${due.length} set(s)…`,
    error: null,
    updatedAt: nowFn().toISOString(),
  });

  const preconsRecord =
    (await services.usernameDirectory.getBySlug(PRECONS_USERNAME)) ||
    (await services.usernameDirectory.resolve(
      PRECONS_USERNAME,
      services.cognitoAuth,
      services.authService.ownerUsername(),
    ));
  if (!preconsRecord?.sub) {
    const msg = `Username directory missing "${PRECONS_USERNAME}" account`;
    await services.releaseSchedule.putJob({
      jobId: RELEASE_ENSURE_JOB_ID,
      status: 'error',
      startedAt: started,
      finishedAt: nowFn().toISOString(),
      error: msg,
      updatedAt: nowFn().toISOString(),
    });
    throw new Error(msg);
  }
  const preconsUserId = preconsRecord.sub;

  let deckList: Awaited<ReturnType<typeof loadMtgjsonCommanderDeckList>> = [];
  try {
    deckList = await loadList({ userAgent: USER_AGENT });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await services.releaseSchedule.putJob({
      jobId: RELEASE_ENSURE_JOB_ID,
      status: 'error',
      startedAt: started,
      finishedAt: nowFn().toISOString(),
      error: `MTGJSON DeckList: ${msg}`,
      updatedAt: nowFn().toISOString(),
    });
    throw e;
  }

  const setsByCode = new Map(schedule.sets.map((s) => [s.setCode.toUpperCase(), { ...s }]));
  let currentSets = schedule.sets.map((s) => ({ ...s }));
  let index = 0;

  for (const dueSet of due) {
    index += 1;
    const code = dueSet.setCode.toUpperCase();
    await services.releaseSchedule.putJob({
      jobId: RELEASE_ENSURE_JOB_ID,
      status: 'running',
      startedAt: started,
      current: index,
      total: due.length,
      label: `Ensuring ${code} (${index}/${due.length})…`,
      error: null,
      updatedAt: nowFn().toISOString(),
    });

    const patched: ReleaseScheduleSet = {
      ...dueSet,
      lastError: null,
      lastEnsuredAt: nowFn().toISOString(),
    };

    try {
      const entries = filterCommanderDecksForSet(deckList, code);
      const displayNames = uniquifyMtgjsonDeckNames(entries);
      const existing = await services.deckRepository.listByUserId(preconsUserId);
      const existingIds = new Set(existing.map((d) => d.deckId));
      let loaded = existing.filter((d) =>
        entries.some((e) => `precon-${e.fileName}` === d.deckId),
      ).length;

      for (const entry of entries) {
        const deckId = `precon-${entry.fileName}`;
        if (existingIds.has(deckId)) {
          continue;
        }
        const mtgDeck = await loadDeck(entry.fileName, { userAgent: USER_AGENT });
        const name = displayNames.get(entry.fileName) || entry.name;
        const built = buildPreconFromMtgjson(entry, mtgDeck, name);
        await services.deckRepository.putByUserId(preconsUserId, built.deckId, built.document);
        existingIds.add(deckId);
        loaded += 1;
        await sleep(REQUEST_DELAY_MS);
      }

      patched.loadedCommanderDecks = loaded;
      if (loaded >= dueSet.expectedCommanderDecks) {
        patched.preconStatus = 'complete';
      } else if (loaded > 0) {
        patched.preconStatus = 'partial';
      } else {
        patched.preconStatus = dueSet.expectedCommanderDecks === 0 ? 'complete' : 'partial';
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patched.preconStatus = 'error';
      patched.lastError = msg;
    }

    try {
      const codes = [code];
      const codesKey = normalizeSetCodesKey(codes);
      const existingPool = await services.setPoolRepository.getSystem(codesKey);
      if (
        existingPool?.cards?.length &&
        Number(existingPool.formatVersion) >= SET_POOL_FORMAT_VERSION
      ) {
        patched.setPoolStatus = 'ready';
      } else {
        const fetched = await fetchCards(codes, { dedupe: true });
        if (fetched.cards.length > 0) {
          await services.setPoolRepository.putSystem(codesKey, {
            codes: fetched.set_codes.length ? fetched.set_codes : codes,
            complete: true,
            primaryCode: fetched.primary_set_code || code,
            setName: dueSet.name || fetched.product_name,
            cards: fetched.cards as unknown as Record<string, unknown>[],
            formatVersion: SET_POOL_FORMAT_VERSION,
            poolKind: 'release',
          });
          patched.setPoolStatus = 'ready';
        } else {
          patched.setPoolStatus = 'pending';
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patched.setPoolStatus = 'error';
      patched.lastError = patched.lastError ? `${patched.lastError}; pool: ${msg}` : msg;
    }

    setsByCode.set(code, patched);
    currentSets = currentSets.map((s) => setsByCode.get(s.setCode.toUpperCase()) || s);
    await services.releaseSchedule.replaceScheduleSets(currentSets);
  }

  await services.releaseSchedule.putJob({
    jobId: RELEASE_ENSURE_JOB_ID,
    status: 'complete',
    startedAt: started,
    finishedAt: nowFn().toISOString(),
    current: due.length,
    total: due.length,
    label: 'Done',
    error: null,
    updatedAt: nowFn().toISOString(),
  });

  return { ok: true, processed: due.length };
}

export async function handler(
  _event?: unknown,
): Promise<{ ok: true; processed: number }> {
  const env = readEnv();
  const doc = createDocClient(env);
  const s3 = new S3BlobStore(createS3Client(env), env.HUB_BUCKET_NAME || 'rayenz-hub-data-local');
  const table = env.HUB_TABLE_NAME || 'HubTable';
  const directory = new UsernameDirectory(doc, table);
  const { createAppServices } = await import('../ioc/index.js');
  const services = createAppServices({
    apiEnv: env,
    docClient: doc,
    deckRepository: new DeckRepository(doc, table, s3),
    setPoolRepository: new SetPoolRepository(doc, table, s3),
    usernameDirectory: new UsernameDirectoryService(directory),
    releaseSchedule: new ReleaseScheduleService(doc, table),
  });
  return runReleaseEnsure(services);
}
