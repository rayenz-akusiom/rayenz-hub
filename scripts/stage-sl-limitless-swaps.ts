#!/usr/bin/env node
/**
 * One-shot (re-runnable): stage Secret Lair "Their Magic Is Limitless" foil
 * printings as formal Queued In entries on hub-hosted decks.
 *
 * Usage:
 *   npm run stage:sl-limitless -- --dry-run
 *   npm run stage:sl-limitless
 *   npx tsx scripts/stage-sl-limitless-swaps.ts --api-url http://127.0.0.1:3000 --api-key test-api-key-local
 *
 * Prerequisites: Hub API reachable with the target library (local SAM or remote).
 */
import {
  DeckDocumentSchema,
  addCardToDeck,
  categoryIncluded,
  fetchCardsCollection,
  isLookingForCategory,
  isSwapQueueCategory,
  mapScryfallCardToPrinting,
  syncCardsWithFormalSwaps,
  type CardInstance,
  type DeckDocument,
  type DeckSummary,
  type FormalSwapEntry,
  type PrintingFields,
  type ScryfallCard,
} from '../packages/shared/src/index.ts';

const DEFAULT_API_URL = 'http://127.0.0.1:3000';
const DEFAULT_API_KEY = 'test-api-key-local';
const NOTES = 'Secret Lair: Their Magic Is Limitless';
const SET_CODE = 'sld';

type Placement = {
  cardName: string;
  collectorNumber: string;
  /** Primary deck name to match (exact preferred). */
  deckName: string;
  /** Extra aliases for contains-match (case-insensitive). */
  deckAliases: string[];
  /** When true, pair Out with an existing non-SL copy of the same card. */
  bling: boolean;
};

const PLACEMENTS: Placement[] = [
  {
    cardName: 'Dark Ritual',
    collectorNumber: '2678',
    deckName: "Dragon-God's Machinations",
    deckAliases: ['bolas', "dragon-god's machinations", 'dragon-gods machinations'],
    bling: false,
  },
  {
    cardName: 'Sol Ring',
    collectorNumber: '2683',
    deckName: 'Dad Energy Racing',
    deckAliases: ['dad energy'],
    bling: true,
  },
  {
    cardName: 'Finale of Devastation',
    collectorNumber: '2680',
    deckName: "Big Ol' Borb",
    deckAliases: ['borb', "big ol' borb", 'big ol borb'],
    bling: false,
  },
  {
    cardName: 'Coat of Arms',
    collectorNumber: '2682',
    deckName: 'God Bane',
    deckAliases: ['god bane'],
    bling: false,
  },
  {
    cardName: 'Path of Ancestry',
    collectorNumber: '2684',
    deckName: 'God Bane',
    deckAliases: ['god bane'],
    bling: true,
  },
];

interface CliOptions {
  apiUrl: string;
  apiKey: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    apiUrl: process.env.HUB_API_URL || DEFAULT_API_URL,
    apiKey: process.env.HUB_API_KEY || DEFAULT_API_KEY,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--api-url') {
      opts.apiUrl = argv[++i] ?? opts.apiUrl;
    } else if (arg === '--api-key') {
      opts.apiKey = argv[++i] ?? opts.apiKey;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    }
  }
  return opts;
}

async function apiRequest(
  apiUrl: string,
  apiKey: string,
  method: string,
  route: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${route} → ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function newSwapId(): string {
  return `swap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isExcludedCategory(name: string): boolean {
  const n = String(name || '').trim();
  if (!n) return true;
  if (n === 'Commander' || n === 'Maybeboard' || n === 'Sideboard' || n === 'Wishlist') return true;
  if (isSwapQueueCategory(n) || isLookingForCategory(n)) return true;
  return false;
}

function pickInTargetCategory(deck: DeckDocument, outCard: CardInstance | null, cardName: string): string {
  if (outCard?.primaryCategory && !isExcludedCategory(outCard.primaryCategory)) {
    return outCard.primaryCategory;
  }
  const sameName = deck.cards.find(
    (c) => c.name === cardName && c.primaryCategory && !isExcludedCategory(c.primaryCategory),
  );
  if (sameName?.primaryCategory) return sameName.primaryCategory;

  const fromDefs = (deck.categories || [])
    .filter((c) => categoryIncluded(deck.categories || [], c.name) && !isExcludedCategory(c.name))
    .map((c) => c.name);
  if (fromDefs[0]) return fromDefs[0];

  const fromCards = [
    ...new Set(
      deck.cards
        .map((c) => c.primaryCategory)
        .filter((n): n is string => Boolean(n) && !isExcludedCategory(n)),
    ),
  ];
  if (fromCards[0]) return fromCards[0];
  return 'Other';
}

function isTargetPrinting(card: CardInstance, printing: PrintingFields): boolean {
  if (printing.scryfallId && card.scryfallId === printing.scryfallId) {
    return Boolean(card.foil) === Boolean(printing.foil);
  }
  return (
    String(card.setCode || '').toLowerCase() === SET_CODE &&
    String(card.collectorNumber || '') === printing.collectorNumber &&
    Boolean(card.foil) === Boolean(printing.foil) &&
    card.name === printing.name
  );
}

function findMatchingPrintingInstance(
  deck: DeckDocument,
  printing: PrintingFields,
): CardInstance | null {
  const sid = printing.scryfallId || null;
  if (sid) {
    const byId = deck.cards.find(
      (c) => c.scryfallId === sid && Boolean(c.foil) === Boolean(printing.foil) && !c.proxy,
    );
    if (byId) return byId;
  }
  return (
    deck.cards.find(
      (c) =>
        String(c.setCode || '').toLowerCase() === SET_CODE &&
        String(c.collectorNumber || '') === printing.collectorNumber &&
        Boolean(c.foil) === Boolean(printing.foil) &&
        !c.proxy &&
        c.name === printing.name,
    ) || null
  );
}

function alreadyStaged(deck: DeckDocument, printing: PrintingFields): boolean {
  const byId = new Map(deck.cards.map((c) => [c.instanceId, c]));
  for (const entry of deck.formalSwapEntries || []) {
    if (!entry.inInstanceId) continue;
    const card = byId.get(entry.inInstanceId);
    if (card && isTargetPrinting(card, printing)) return true;
  }
  return false;
}

function findBlingOut(deck: DeckDocument, cardName: string, printing: PrintingFields): CardInstance | null {
  const usedOut = new Set(
    (deck.formalSwapEntries || []).map((e) => e.outInstanceId).filter(Boolean) as string[],
  );
  return (
    deck.cards.find(
      (c) =>
        c.name === cardName &&
        !c.proxy &&
        !isTargetPrinting(c, printing) &&
        !usedOut.has(c.instanceId),
    ) || null
  );
}

function resolveDeck(
  summaries: DeckSummary[],
  placement: Placement,
): DeckSummary {
  const exact = summaries.filter((s) => s.name === placement.deckName);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) {
    throw new Error(
      `Ambiguous exact match for "${placement.deckName}": ${exact.map((s) => s.deckId).join(', ')}`,
    );
  }

  const aliases = [placement.deckName, ...placement.deckAliases].map((a) => a.toLowerCase());
  const hits = summaries.filter((s) => {
    const n = s.name.toLowerCase();
    return aliases.some((a) => n === a || n.includes(a));
  });
  if (hits.length === 0) {
    throw new Error(
      `No deck matched "${placement.deckName}" (aliases: ${placement.deckAliases.join(', ')}). ` +
        `Library has: ${summaries.map((s) => s.name).join('; ') || '(empty)'}`,
    );
  }
  if (hits.length > 1) {
    // Prefer exact alias equality over contains when multiple hit.
    const equal = hits.filter((s) => aliases.includes(s.name.toLowerCase()));
    if (equal.length === 1) return equal[0]!;
    throw new Error(
      `Ambiguous deck match for "${placement.deckName}": ${hits.map((s) => `${s.name} (${s.deckId})`).join(', ')}`,
    );
  }
  return hits[0]!;
}

function stagePlacement(
  deck: DeckDocument,
  printing: PrintingFields,
  placement: Placement,
): { deck: DeckDocument; action: string } {
  if (alreadyStaged(deck, printing)) {
    return { deck, action: 'skip (already staged)' };
  }

  let next = deck;
  let inCard = findMatchingPrintingInstance(next, printing);
  if (!inCard) {
    const before = new Set(next.cards.map((c) => c.instanceId));
    const targetCat = pickInTargetCategory(next, null, placement.cardName);
    next = addCardToDeck(next, printing, targetCat);
    inCard = next.cards.find((c) => !before.has(c.instanceId)) || null;
    if (!inCard) throw new Error(`Failed to add ${printing.name} to ${deck.name}`);
  }

  let outCard: CardInstance | null = null;
  if (placement.bling) {
    outCard = findBlingOut(next, placement.cardName, printing);
  }

  const inTargetCategory = pickInTargetCategory(next, outCard, placement.cardName);
  const entries: FormalSwapEntry[] = [...(next.formalSwapEntries || [])].map((e, i) => ({
    ...e,
    sortIndex: i,
  }));
  entries.push({
    id: newSwapId(),
    inInstanceId: inCard.instanceId,
    outInstanceId: outCard?.instanceId ?? null,
    inTargetCategory,
    sortIndex: entries.length,
    notes: NOTES,
  });

  next = syncCardsWithFormalSwaps(next, entries);
  const outLabel = outCard
    ? `Out=${outCard.name} (${outCard.instanceId}, ${outCard.setCode}#${outCard.collectorNumber})`
    : placement.bling
      ? 'Out=(none — warned)'
      : 'Out=(unpaired)';
  return {
    deck: next,
    action: `add In=${printing.name} sld#${printing.collectorNumber} foil → ${inTargetCategory}; ${outLabel}`,
  };
}

async function loadPrintings(): Promise<Map<string, PrintingFields>> {
  const identifiers = PLACEMENTS.map((p) => ({
    set: SET_CODE,
    collector_number: p.collectorNumber,
  }));
  const scryfallFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('User-Agent', 'rayenz-hub-stage-sl-limitless/1.0');
    headers.set('Accept', 'application/json');
    return fetch(input, { ...init, headers });
  };
  const result = await fetchCardsCollection(identifiers, { fetchImpl: scryfallFetch });
  if (result.not_found.length) {
    throw new Error(
      `Scryfall not_found: ${result.not_found.map((x) => JSON.stringify(x)).join(', ')}`,
    );
  }
  const byCn = new Map<string, ScryfallCard>();
  for (const card of result.data) {
    byCn.set(String(card.collector_number), card);
  }
  const out = new Map<string, PrintingFields>();
  for (const p of PLACEMENTS) {
    const card = byCn.get(p.collectorNumber);
    if (!card) throw new Error(`Missing Scryfall card for sld#${p.collectorNumber} (${p.cardName})`);
    if (card.name !== p.cardName) {
      throw new Error(
        `Name mismatch for sld#${p.collectorNumber}: expected "${p.cardName}", got "${card.name}"`,
      );
    }
    const printing = mapScryfallCardToPrinting(card, { foil: true });
    if (!printing.foil) {
      console.warn(
        `Warning: ${p.cardName} sld#${p.collectorNumber} has no foil finish in Scryfall; staging as nonfoil.`,
      );
    }
    out.set(p.collectorNumber, printing);
  }
  return out;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Hub API: ${opts.apiUrl}${opts.dryRun ? ' (dry-run)' : ''}`);

  const printings = await loadPrintings();
  console.log(`Resolved ${printings.size} foil SLD printings from Scryfall.`);

  const list = (await apiRequest(opts.apiUrl, opts.apiKey, 'GET', '/v1/decks')) as {
    decks?: DeckSummary[];
  };
  const summaries = list?.decks || [];
  if (!summaries.length) {
    throw new Error('Hub API returned no decks. Seed or point --api-url at the library host.');
  }
  console.log(`Library: ${summaries.length} deck(s).`);

  /** Mutate each deck once even if multiple placements target it. */
  const byDeckId = new Map<string, DeckDocument>();
  const actions: string[] = [];
  let skipped = 0;
  let staged = 0;
  const blingWarnings: string[] = [];

  for (const placement of PLACEMENTS) {
    const summary = resolveDeck(summaries, placement);
    let doc = byDeckId.get(summary.deckId);
    if (!doc) {
      const raw = await apiRequest(
        opts.apiUrl,
        opts.apiKey,
        'GET',
        `/v1/decks/${encodeURIComponent(summary.deckId)}`,
      );
      const parsed = DeckDocumentSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Invalid deck document for ${summary.name}: ${parsed.error.message}`);
      }
      doc = parsed.data;
      byDeckId.set(summary.deckId, doc);
    }

    const printing = printings.get(placement.collectorNumber)!;
    const { deck: next, action } = stagePlacement(doc, printing, placement);
    byDeckId.set(summary.deckId, next);
    const line = `${summary.name} (${summary.deckId}): ${action}`;
    actions.push(line);
    if (action.startsWith('skip')) skipped += 1;
    else {
      staged += 1;
      if (placement.bling && action.includes('Out=(none')) {
        blingWarnings.push(`${placement.cardName} → ${summary.name}: no existing copy to queue as Out`);
      }
    }
    console.log(line);
  }

  if (opts.dryRun) {
    console.log(`\nDry-run complete. Would stage ${staged}, skip ${skipped}. No PUTs.`);
    if (blingWarnings.length) {
      for (const w of blingWarnings) console.warn(`Warning: ${w}`);
    }
    return;
  }

  for (const [deckId, doc] of byDeckId) {
    const body = DeckDocumentSchema.parse({
      ...doc,
      updatedAt: new Date().toISOString(),
    });
    await apiRequest(
      opts.apiUrl,
      opts.apiKey,
      'PUT',
      `/v1/decks/${encodeURIComponent(deckId)}`,
      body,
    );
    console.log(`✓ PUT ${body.name} (${deckId}) formalSwaps=${body.formalSwapEntries.length}`);
  }

  console.log(`\nDone. Staged ${staged}, skipped ${skipped}, decks updated ${byDeckId.size}.`);
  if (blingWarnings.length) {
    for (const w of blingWarnings) console.warn(`Warning: ${w}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
