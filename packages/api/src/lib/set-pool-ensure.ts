import {
  SET_POOL_FORMAT_VERSION,
  fetchSetCards,
  normalizeSetCodesKey,
  type AuthContext,
  type SetPoolUpsert,
} from '@rayenz-hub/shared';
import type { ApiEnv } from './auth.js';
import type { SetPoolRecord, SetPoolRepository } from '../repositories/set-pool-repository.js';

export function isCurrentSetPool(
  pool: SetPoolRecord | null | undefined,
): pool is SetPoolRecord {
  return !!(
    pool?.cards?.length &&
    Number(pool.formatVersion) >= SET_POOL_FORMAT_VERSION
  );
}

export type EnsureSystemSetPoolOpts = {
  primaryCode?: string;
  setName?: string;
  fetchSetCards?: typeof fetchSetCards;
};

/** Warm or return a current SYSTEM release set pool. Null when fetch yields no cards. */
export async function ensureSystemSetPool(
  repo: Pick<SetPoolRepository, 'getSystem' | 'putSystem'>,
  codes: string[],
  opts?: EnsureSystemSetPoolOpts,
): Promise<SetPoolRecord | null> {
  const codesKey = normalizeSetCodesKey(codes);
  const existing = await repo.getSystem(codesKey);
  if (isCurrentSetPool(existing)) {
    return existing;
  }

  const fetchCards = opts?.fetchSetCards || fetchSetCards;
  const fetched = await fetchCards(codes, { dedupe: true });
  if (!fetched.cards.length) {
    return null;
  }

  return repo.putSystem(codesKey, {
    codes: fetched.set_codes.length ? fetched.set_codes : codes,
    complete: true,
    primaryCode: opts?.primaryCode || fetched.primary_set_code || codes[0],
    setName: opts?.setName || fetched.product_name,
    cards: fetched.cards as unknown as Record<string, unknown>[],
    formatVersion: SET_POOL_FORMAT_VERSION,
    poolKind: 'release',
  });
}

export async function copySystemPoolToUser(
  repo: Pick<SetPoolRepository, 'put'>,
  auth: AuthContext,
  env: ApiEnv,
  codesKey: string,
  systemPool: SetPoolRecord,
): Promise<SetPoolRecord> {
  const input: SetPoolUpsert = {
    codes: systemPool.codes,
    complete: systemPool.complete,
    primaryCode: systemPool.primaryCode,
    setName: systemPool.setName,
    cards: systemPool.cards,
    formatVersion: systemPool.formatVersion,
    poolKind: systemPool.poolKind || 'release',
  };
  return repo.put(auth, env, codesKey, input);
}
