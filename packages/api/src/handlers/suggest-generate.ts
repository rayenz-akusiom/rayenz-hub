import {
  SET_POOL_FORMAT_VERSION,
  SuggestGenerateRequestSchema,
  SuggestGenerateResponseSchema,
  normalizeSetCodes,
  normalizeSetCodesKey,
  pinnedReleasePoolKey,
  type SuggestRelease,
} from '@rayenz-hub/shared';
import { fetchPinnedReleaseCards, fetchReleaseCards, fetchSetCards } from '@rayenz-hub/shared';
import {
  assemblePackages,
  budgetSuggestDeckCap,
  budgetSuggestPerRuleCap,
  buildUpgradePool,
  computeUpgradePoolKey,
  enrichSuggestionPrices,
  filterSuggestionsByFocus,
  hubDeckToRecord,
  normalizeFocusTags,
  ownedNamesFromDeck,
  parseYamlProfile,
  readUpgradePoolCap,
  runRulesForDeck,
  runRulesForPage,
  setScopeFromPool,
} from '@rayenz-hub/shared/suggest';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { mapHandlerError, mapScryfallUpstreamError } from '../lib/handler-errors.js';
import { parseJsonBody } from '../lib/keyed-resource-handler.js';
import { requireSpendUnlocked } from '../lib/route-policy.js';
import { getAppServices, type AppServices } from '../ioc/index.js';
import type { SetPoolRecord } from '../repositories/set-pool-repository.js';
import type { DeckRecord, Suggestion } from '@rayenz-hub/shared/suggest';

export function readSuggestDeckCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.HUB_SUGGEST_DECK_CAP;
  const n = raw != null && raw !== '' ? Number.parseInt(String(raw), 10) : 20;
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export type SuggestGenerateDeps = {
  fetchReleaseCards?: typeof fetchReleaseCards;
  fetchPinnedReleaseCards?: typeof fetchPinnedReleaseCards;
  fetchSetCards?: typeof fetchSetCards;
  buildUpgradePool?: typeof buildUpgradePool;
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
    poolKind: 'release',
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

  if (kind === 'pinned') {
    const codesKey = pinnedReleasePoolKey(code);
    const existing = await services.setPoolRepository.get(auth, env, codesKey);
    if (isCurrentSetPool(existing)) {
      return existing;
    }
    const fetchPinned = deps.fetchPinnedReleaseCards || fetchPinnedReleaseCards;
    const fetched = await fetchPinned(code, { dedupe: true });
    const codes = fetched.set_codes.length ? fetched.set_codes : [];
    return services.setPoolRepository.put(auth, env, codesKey, {
      codes,
      complete: true,
      primaryCode: fetched.primary_set_code,
      setName: fetched.product_name,
      cards: fetched.cards as unknown as Record<string, unknown>[],
      formatVersion: SET_POOL_FORMAT_VERSION,
      poolKind: 'release',
    });
  }

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
    poolKind: 'release',
  });
}

async function ensureUpgradePool(
  services: AppServices,
  auth: Parameters<AppServices['setPoolRepository']['get']>[0],
  env: Parameters<AppServices['setPoolRepository']['get']>[1],
  deck: DeckRecord,
  profile: DeckRecord['profile'],
  budgetUsd: number,
  focusTags: string[],
  deps: SuggestGenerateDeps,
): Promise<SetPoolRecord> {
  const codesKey = computeUpgradePoolKey(deck.deck_id, budgetUsd, focusTags);
  const existing = await services.setPoolRepository.get(auth, env, codesKey);
  if (isCurrentSetPool(existing)) {
    return existing;
  }

  const buildPool = deps.buildUpgradePool || buildUpgradePool;
  const built = await buildPool(deck, profile, budgetUsd, {
    focusTags,
    cap: readUpgradePoolCap(),
  });
  if (!built.cards.length) {
    const err = new Error('Upgrade pool empty');
    (err as { code?: string }).code = 'UPGRADE_POOL_EMPTY';
    throw err;
  }

  return services.setPoolRepository.put(auth, env, codesKey, {
    codes: built.codes,
    complete: true,
    primaryCode: built.primaryCode,
    setName: 'Budget upgrade pool',
    cards: built.cards as unknown as Record<string, unknown>[],
    formatVersion: SET_POOL_FORMAT_VERSION,
    poolKind: 'upgrade',
    deckId: deck.deck_id,
    budgetUsd,
    focusTags,
  });
}

function mapUpgradePoolEmpty(e: unknown): ReturnType<typeof jsonResponse> | null {
  const code = (e as { code?: string })?.code;
  if (code === 'UPGRADE_POOL_EMPTY') {
    return jsonResponse(409, {
      error: 'Upgrade pool empty after filters',
      code: 'UPGRADE_POOL_EMPTY',
    });
  }
  return null;
}

function applyFocusToSuggestions(suggestions: Suggestion[], focusTags: string[]): Suggestion[] {
  return filterSuggestionsByFocus(suggestions, focusTags);
}

function budgetPackagesForDeck(
  deck: DeckRecord,
  suggestions: Suggestion[],
  budgetUsd: number,
  opts: { maxSwaps?: number; excludeOwned?: boolean },
) {
  const focused = suggestions;
  enrichSuggestionPrices(focused);
  const owned = ownedNamesFromDeck(deck);
  return assemblePackages(focused, {
    budgetUsd,
    maxSwaps: opts.maxSwaps,
    excludeOwned: opts.excludeOwned,
    ownedNames: owned,
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
    const locked = await requireSpendUnlocked(services.spendLock);
    if (locked) return locked;
    const parsedBody = parseJsonBody(body);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const parsed = SuggestGenerateRequestSchema.safeParse(parsedBody.value);
    if (!parsed.success) {
      return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
    }
    const { deckIds, budgetUsd, maxSwaps, excludeOwned, focusTags: focusRaw } = parsed.data;
    const focusTags = normalizeFocusTags(focusRaw);
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

    const isBudget = budgetUsd != null && budgetUsd > 0;

    if (isBudget) {
      const deckId = deckIds[0];
      const doc = await services.deckRepository.get(auth, env, deckId);
      if (!doc) {
        const payload = {
          cap,
          mode: 'budget' as const,
          setCodes: [],
          setCodesKey: computeUpgradePoolKey(deckId, budgetUsd, focusTags),
          upgradePoolKey: computeUpgradePoolKey(deckId, budgetUsd, focusTags),
          focusTags: focusTags.length ? focusTags : undefined,
          taggerCoverage: { cardsResolved: 0, cardsWithTags: 0, percent: 0 },
          deckResults: [
            {
              deckId,
              deckName: deckId,
              skipped: true,
              skipReason: 'not_found',
              message: 'Deck not found',
              suggestions: [],
              audit: [],
            },
          ],
        };
        return jsonResponse(200, SuggestGenerateResponseSchema.parse(payload));
      }

      const record = hubDeckToRecord(doc);
      const profileDoc = await services.profileRepository.get(auth, env, deckId);
      if (profileDoc?.yaml) {
        record.profile = parseYamlProfile(profileDoc.yaml);
      }

      let pool: SetPoolRecord;
      try {
        pool = await ensureUpgradePool(
          services,
          auth,
          env,
          record,
          record.profile,
          budgetUsd,
          focusTags,
          deps,
        );
      } catch (e) {
        const mapped = mapUpgradePoolEmpty(e);
        if (mapped) return mapped;
        const scryfall = mapScryfallUpstreamError(e);
        if (scryfall) {
          console.error('Budget upgrade pool failed', { deckId, budgetUsd, focusTags, error: e });
          return scryfall;
        }
        throw e;
      }

      const codesKey = pool.codesKey || computeUpgradePoolKey(deckId, budgetUsd, focusTags);
      const output = runRulesForDeck(record, setScopeFromPool(pool), {
        focusTags,
        deckSoftCap: budgetSuggestDeckCap(maxSwaps),
        perRuleSoftCap: budgetSuggestPerRuleCap(),
      });
      let suggestions = applyFocusToSuggestions(output.suggestions, focusTags);
      const { packages, audit: packaging } = budgetPackagesForDeck(record, suggestions, budgetUsd, {
        maxSwaps,
        excludeOwned,
      });
      const packagingWithPool = {
        ...packaging,
        poolCardCount: pool.cards.length,
      };

      const payload = {
        cap,
        mode: 'budget' as const,
        setCodes: pool.codes?.length ? pool.codes : [codesKey],
        setCodesKey: codesKey,
        upgradePoolKey: codesKey,
        focusTags: focusTags.length ? focusTags : undefined,
        taggerCoverage: output.taggerCoverage,
        deckResults: [
          {
            deckId: record.deck_id,
            deckName: record.deck_name,
            skipped: false,
            suggestions,
            audit: output.audit,
            packages,
            packaging: packagingWithPool,
          },
        ],
      };
      return jsonResponse(200, SuggestGenerateResponseSchema.parse(payload));
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
    const codesKey =
      releaseUsed?.kind === 'pinned'
        ? pinnedReleasePoolKey(releaseUsed.code)
        : normalizeSetCodesKey(codes);

    const pageDecks: Array<{ deck: ReturnType<typeof hubDeckToRecord> }> = [];
    for (const deckId of deckIds) {
      const doc = await services.deckRepository.get(auth, env, deckId);
      if (!doc) {
        continue;
      }
      const record = hubDeckToRecord(doc);
      const profile = await services.profileRepository.get(auth, env, deckId);
      if (profile?.yaml) {
        record.profile = parseYamlProfile(profile.yaml);
      }
      pageDecks.push({ deck: record });
    }

    const { deckResults, taggerCoverage } = runRulesForPage(pageDecks, setScopeFromPool(pool), {
      focusTags,
    });
    const ordered = deckIds.map((deckId) => {
      const found = deckResults.find((r) => r.deckId === deckId);
      if (found) {
        const suggestions = applyFocusToSuggestions(found.suggestions, focusTags);
        return { ...found, suggestions };
      }
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
      mode: 'set' as const,
      setCodes: codes,
      setCodesKey: codesKey,
      focusTags: focusTags.length ? focusTags : undefined,
      release: releaseUsed,
      taggerCoverage,
      deckResults: ordered,
    };
    const validated = SuggestGenerateResponseSchema.parse(payload);
    return jsonResponse(200, validated);
  } catch (e) {
    const mapped = mapUpgradePoolEmpty(e);
    if (mapped) return mapped;
    const scryfall = mapScryfallUpstreamError(e);
    if (scryfall) return scryfall;
    const handlerMapped = mapHandlerError(e, services.authService);
    if (handlerMapped) return handlerMapped;
    throw e;
  }
}
