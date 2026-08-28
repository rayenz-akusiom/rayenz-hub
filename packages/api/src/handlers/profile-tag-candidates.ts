import { maybeAttachScryfallTags } from '@rayenz-hub/shared';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { requireSpendUnlocked } from '../lib/route-policy.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

const SCRYFALL_API = 'https://api.scryfall.com';
const MAX_CARDS = 5;

function parseCardNames(raw: string | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of String(raw || '').split(',')) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, MAX_CARDS);
}

async function fetchCardByExactName(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown> | null> {
  const url = `${SCRYFALL_API}/cards/named?exact=${encodeURIComponent(name)}`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

export type ProfileTagCandidatesDeps = {
  fetchImpl?: typeof fetch;
  fetchCardByExactName?: typeof fetchCardByExactName;
  maybeAttachScryfallTags?: typeof maybeAttachScryfallTags;
};

export async function handleProfileTagCandidates(
  deckId: string,
  headers: Record<string, string | undefined>,
  cardsParam: string | null | undefined,
  services: AppServices = getAppServices(),
  deps: ProfileTagCandidatesDeps = {},
) {
  try {
    const { auth, env } = await services.authService.authenticate(headers);
    const locked = await requireSpendUnlocked(services.spendLock);
    if (locked) return locked;

    const names = parseCardNames(cardsParam);
    const rawCount = String(cardsParam || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean).length;
    if (!names.length) {
      return errorResponse(400, 'Provide 1–5 card names in cards query param', 'BAD_REQUEST');
    }
    if (rawCount > MAX_CARDS) {
      return errorResponse(400, 'At most 5 cards allowed', 'BAD_REQUEST');
    }

    const deck = await services.deckRepository.get(auth, env, deckId);
    if (!deck) {
      return errorResponse(404, 'Deck not found', 'NOT_FOUND');
    }

    const fetchCard = deps.fetchCardByExactName || fetchCardByExactName;
    const attachTags = deps.maybeAttachScryfallTags || maybeAttachScryfallTags;
    const fetchImpl = deps.fetchImpl;

    const byCard: Record<string, string[]> = {};
    const cardsMissing: string[] = [];
    const resolved: Array<{ name: string; oracle_id?: string | null; illustration_id?: string | null }> = [];

    for (const requested of names) {
      const raw = await fetchCard(requested, fetchImpl);
      if (!raw) {
        cardsMissing.push(requested);
        byCard[requested] = [];
        continue;
      }
      const resolvedName = String(raw.name || requested);
      resolved.push({
        name: resolvedName,
        oracle_id: raw.oracle_id != null ? String(raw.oracle_id) : null,
        illustration_id: raw.illustration_id != null ? String(raw.illustration_id) : null,
      });
    }

    const tagged = await attachTags(resolved, { fetchImpl });
    for (const card of tagged) {
      const tags = (card.oracle_tags || []).map((t) => String(t).trim()).filter(Boolean);
      byCard[card.name] = tags;
    }

    const tagSet = new Set<string>();
    Object.values(byCard).forEach((tags) => tags.forEach((t) => tagSet.add(t)));
    const tags = [...tagSet].sort();

    return jsonResponse(200, {
      deckId,
      tags,
      byCard,
      cardsMissing,
    });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
