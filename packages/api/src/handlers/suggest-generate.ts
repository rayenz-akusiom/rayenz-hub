import {
  SET_POOL_FORMAT_VERSION,
  SuggestGenerateRequestSchema,
  SuggestGenerateResponseSchema,
  normalizeSetCodes,
  normalizeSetCodesKey,
  type SuggestRelease,
} from '@rayenz-hub/shared';
import { fetchReleaseCards, fetchSetCards } from '@rayenz-hub/shared';
import {
  hubDeckToRecord,
  parseYamlProfile,
  runRulesForPage,
  setScopeFromPool,
} from '@rayenz-hub/shared/suggest';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { parseJsonBody } from '../lib/keyed-resource-handler.js';
import { requireOwnerAndSpendUnlocked } from '../lib/route-policy.js';
import { getAppServices, type AppServices } from '../ioc/index.js';
import type { SetPoolRecord } from '../repositories/set-pool-repository.js';

export function readSuggestDeckCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.HUB_SUGGEST_DECK_CAP;
  const n = raw != null && raw !== '' ? Number.parseInt(String(raw), 10) : 20;
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export type SuggestGenerateDeps = {
  fetchReleaseCards?: typeof fetchReleaseCards;
  fetchSetCards?: typeof fetchSetCards;
};

function isCurrentSetPool(pool: SetPoolRecord | null | undefined): pool is SetPoolRecord {
  return !!(
    pool?.cards?.length &&
    Number(pool.formatVersion) >= SET_POOL_FORMAT_VERSION
  );
}

async function ensureSetPoolFromCodes(
  services: AppServices,
  auth: Parameters<AppServices['setPoolRepository']['get']>[0],
  env: Parameters<AppServices['setPoolRepository']['get']>[1],
  codes: string[],
  opts?: { primaryCode?: string; setName?: string; fetchSetCards?: typeof fetchSetCards },
): Promise<SetPoolRecord> {
  const codesKey = normalizeSetCodesKey(codes);
  const existing = await services.setPoolRepository.get(auth, env, codesKey);
  if (isCurrentSetPool(existing)) {
    return existing;
  }

  const fetchCards = opts?.fetchSetCards || fetchSetCards;
  const fetched = await fetchCards(codes, { dedupe: true });
  return services.setPoolRepository.put(auth, env, codesKey, {
    codes: fetched.set_codes.length ? fetched.set_codes : codes,
    complete: true,
    primaryCode: opts?.primaryCode || fetched.primary_set_code,
    setName: opts?.setName || fetched.product_name,
    cards: fetched.cards as unknown as Record<string, unknown>[],
    formatVersion: SET_POOL_FORMAT_VERSION,
  });
}

async function ensureSetPoolFromRelease(
  services: AppServices,
  auth: Parameters<AppServices['setPoolRepository']['get']>[0],
  env: Parameters<AppServices['setPoolRepository']['get']>[1],
  release: SuggestRelease,
  deps: SuggestGenerateDeps,
): Promise<SetPoolRecord> {
  const kind = release.kind;
  const code = release.code.trim().toUpperCase();
  // Provisional key until cards reveal the full family; prefer cached pool by catalog codes later.
  const fetchCards = deps.fetchReleaseCards || fetchReleaseCards;
  const fetched = await fetchCards(kind, code, { dedupe: true });
  const codes = fetched.set_codes.length ? fetched.set_codes : [code];
  const codesKey = normalizeSetCodesKey(codes);
  const existing = await services.setPoolRepository.get(auth, env, codesKey);
  if (isCurrentSetPool(existing)) {
    return existing;
  }
  return services.setPoolRepository.put(auth, env, codesKey, {
    codes,
    complete: true,
    primaryCode: fetched.primary_set_code,
    setName: fetched.product_name,
    cards: fetched.cards as unknown as Record<string, unknown>[],
    formatVersion: SET_POOL_FORMAT_VERSION,
  });
}

export async function handleSuggestGenerate(
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
  deps: SuggestGenerateDeps = {},
) {
  try {
    const { auth, env } = await services.authService.authenticate(headers);
    const locked = await requireOwnerAndSpendUnlocked(auth, services.authService, services.spendLock);
    if (locked) return locked;
    const parsedBody = parseJsonBody(body);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const parsed = SuggestGenerateRequestSchema.safeParse(parsedBody.value);
    if (!parsed.success) {
      return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
    }
    const { deckIds } = parsed.data;
    if (new Set(deckIds).size !== deckIds.length) {
      return errorResponse(400, 'deckIds must be unique', 'BAD_REQUEST');
    }
    const cap = readSuggestDeckCap();
    if (deckIds.length > cap) {
      return jsonResponse(400, {
        error: 'Page too large',
        code: 'PAGE_TOO_LARGE',
        cap,
        requested: deckIds.length,
      });
    }

    let pool: SetPoolRecord;
    let releaseUsed: SuggestRelease | undefined;

    if (parsed.data.release) {
      releaseUsed = {
        kind: parsed.data.release.kind,
        code: parsed.data.release.code.trim().toUpperCase(),
      };
      pool = await ensureSetPoolFromRelease(services, auth, env, releaseUsed, deps);
    } else {
      const codes = normalizeSetCodes(parsed.data.setCodes || []);
      if (!codes.length) {
        return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
      }
      pool = await ensureSetPoolFromCodes(services, auth, env, codes, {
        fetchSetCards: deps.fetchSetCards,
      });
    }

    const codes = pool.codes?.length ? pool.codes : [];
    const codesKey = normalizeSetCodesKey(codes);

    const pageDecks: Array<{ deck: ReturnType<typeof hubDeckToRecord> }> = [];
    const notFound: Array<{ deckId: string }> = [];
    for (const deckId of deckIds) {
      const doc = await services.deckRepository.get(auth, env, deckId);
      if (!doc) {
        notFound.push({ deckId });
        continue;
      }
      const record = hubDeckToRecord(doc);
      const profile = await services.profileRepository.get(auth, env, deckId);
      if (profile?.yaml) {
        record.profile = parseYamlProfile(profile.yaml);
      }
      pageDecks.push({ deck: record });
    }

    const { deckResults, taggerCoverage } = runRulesForPage(pageDecks, setScopeFromPool(pool));
    const ordered = deckIds.map((deckId) => {
      const found = deckResults.find((r) => r.deckId === deckId);
      if (found) return found;
      return {
        deckId,
        deckName: deckId,
        skipped: true,
        skipReason: 'not_found',
        message: 'Deck not found',
        suggestions: [],
        audit: [],
      };
    });

    const payload = {
      cap,
      setCodes: codes,
      setCodesKey: codesKey,
      release: releaseUsed,
      taggerCoverage,
      deckResults: ordered,
    };
    const validated = SuggestGenerateResponseSchema.parse(payload);
    return jsonResponse(200, validated);
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
