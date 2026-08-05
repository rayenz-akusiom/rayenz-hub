import type { CardInstance, DeckDocument } from '../../schemas/deck-builder.js';
import { cardDisplayName, getOracle, resolveCardView } from '../card-oracle.js';
import { collectCommanders, pickCommanderPair } from '../partner.js';
import { toGlanceCard } from '../glance/card-from-instance.js';
import type {
  BuildSwapGlanceOptions,
  SwapGlanceCard,
  SwapGlanceIncludeSet,
  SwapGlanceRequestItem,
  SwapGlanceRow,
  SwapGlanceSection,
} from './types.js';

function toSwapGlanceCard(card: CardInstance, doc: DeckDocument): SwapGlanceCard {
  return toGlanceCard(card, doc, { includeProxy: true });
}

function commanderDisplayName(deck: DeckDocument, card: CardInstance): string {
  const oracle = getOracle(deck, card);
  const view = resolveCardView(card, oracle);
  return cardDisplayName(view) || card.name;
}

/** Deck name — commander(s) as text; deck name only when no commanders. */
export function swapGlanceHeaderText(deck: DeckDocument): string {
  const deckName = String(deck.name || '').trim() || 'Deck';
  const pair = pickCommanderPair(deck.cards || []);
  if (pair.status === 'single' && pair.a) {
    const card = (deck.cards || []).find((c) => c.instanceId === pair.a!.instanceId) || null;
    const cmd = card
      ? commanderDisplayName(deck, card)
      : String(pair.a.name || '').trim();
    return cmd ? `${deckName} — ${cmd}` : deckName;
  }
  if (
    (pair.status === 'legal' || pair.status === 'illegal' || pair.status === 'unknown') &&
    pair.a &&
    pair.b
  ) {
    const cardA = (deck.cards || []).find((c) => c.instanceId === pair.a!.instanceId);
    const cardB = (deck.cards || []).find((c) => c.instanceId === pair.b!.instanceId);
    const a = cardA ? commanderDisplayName(deck, cardA) : String(pair.a.name || '').trim();
    const b = cardB ? commanderDisplayName(deck, cardB) : String(pair.b.name || '').trim();
    if (a && b) return `${deckName} — ${a} / ${b}`;
  }
  // Fallback: list Commander-category names when pickCommanderPair is "many"
  const cmds = collectCommanders(deck.cards || []);
  if (cmds.length > 0 && cmds.length <= 2) {
    const names = cmds.map((c) => commanderDisplayName(deck, c)).filter(Boolean);
    if (names.length === 1) return `${deckName} — ${names[0]}`;
    if (names.length === 2) return `${deckName} — ${names[0]} / ${names[1]}`;
  }
  return deckName;
}

export type BuildSwapGlanceIncludeSetResult =
  | { ok: true; includeSet: SwapGlanceIncludeSet }
  | { ok: false; code: 'SWAP_GLANCE_EMPTY' | 'SWAP_GLANCE_UNKNOWN_DECK'; message: string };

function itemKey(item: SwapGlanceRequestItem): string {
  return `${item.deckId}\0${item.kind}\0${item.entryId}`;
}

/**
 * Authoritative include set from Hub decks + client-selected entry refs.
 */
export function buildSwapGlanceIncludeSet(
  decks: DeckDocument[],
  items: SwapGlanceRequestItem[],
  options: BuildSwapGlanceOptions,
): BuildSwapGlanceIncludeSetResult {
  const { mode, includeSeeking } = options;
  const filterSetCodes = Array.isArray(options.filterSetCodes)
    ? options.filterSetCodes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)
    : [];
  const deckById = new Map((decks || []).map((d) => [d.deckId, d]));

  for (const item of items || []) {
    if (!deckById.has(item.deckId)) {
      return {
        ok: false,
        code: 'SWAP_GLANCE_UNKNOWN_DECK',
        message: `Deck not found: ${item.deckId}`,
      };
    }
  }

  // Group requested items by deck (stable deck order: first appearance in items)
  const deckOrder: string[] = [];
  const itemsByDeck = new Map<string, SwapGlanceRequestItem[]>();
  const seenItem = new Set<string>();
  for (const item of items || []) {
    const k = itemKey(item);
    if (seenItem.has(k)) continue;
    // For full mode pair items, collapse queued_in/queued_out to one per entry
    if (mode === 'full' && (item.kind === 'queued_in' || item.kind === 'queued_out')) {
      const pairKey = `pair:${item.deckId}:${item.entryId}`;
      if (seenItem.has(pairKey)) continue;
      seenItem.add(pairKey);
    } else {
      seenItem.add(k);
    }
    if (!itemsByDeck.has(item.deckId)) {
      deckOrder.push(item.deckId);
      itemsByDeck.set(item.deckId, []);
    }
    itemsByDeck.get(item.deckId)!.push(item);
  }

  const sections: SwapGlanceSection[] = [];

  for (const deckId of deckOrder) {
    const deck = deckById.get(deckId)!;
    const byId = new Map((deck.cards || []).map((c) => [c.instanceId, c]));
    const formalById = new Map((deck.formalSwapEntries || []).map((e) => [e.id, e]));
    const lookingById = new Map((deck.lookingForEntries || []).map((e) => [e.id, e]));
    const rows: SwapGlanceRow[] = [];
    const addedPair = new Set<string>();
    const addedSeeking = new Set<string>();
    const addedInOnly = new Set<string>();

    for (const item of itemsByDeck.get(deckId) || []) {
      if (item.kind === 'seeking') {
        if (!includeSeeking) continue;
        if (addedSeeking.has(item.entryId)) continue;
        const entry = lookingById.get(item.entryId);
        if (!entry) continue;
        const card = byId.get(entry.instanceId);
        if (!card) continue;
        addedSeeking.add(item.entryId);
        rows.push({
          kind: 'single',
          entryId: item.entryId,
          sourceKind: 'seeking',
          card: toSwapGlanceCard(card, deck),
        });
        continue;
      }

      if (mode === 'in_only') {
        if (item.kind !== 'queued_in') continue;
        if (addedInOnly.has(item.entryId)) continue;
        const entry = formalById.get(item.entryId);
        if (!entry?.inInstanceId) continue;
        const card = byId.get(entry.inInstanceId);
        if (!card) continue;
        addedInOnly.add(item.entryId);
        rows.push({
          kind: 'single',
          entryId: item.entryId,
          sourceKind: 'queued_in',
          card: toSwapGlanceCard(card, deck),
        });
        continue;
      }

      // full pair
      if (addedPair.has(item.entryId)) continue;
      const entry = formalById.get(item.entryId);
      if (!entry) continue;
      addedPair.add(item.entryId);
      const inCard = entry.inInstanceId ? byId.get(entry.inInstanceId) : undefined;
      const outCard = entry.outInstanceId ? byId.get(entry.outInstanceId) : undefined;
      if (!inCard && !outCard) continue;
      rows.push({
        kind: 'pair',
        entryId: item.entryId,
        out: outCard ? toSwapGlanceCard(outCard, deck) : null,
        in: inCard ? toSwapGlanceCard(inCard, deck) : null,
      });
    }

    if (!rows.length) continue;
    sections.push({
      deckId: deck.deckId,
      deckName: deck.name,
      headerText: swapGlanceHeaderText(deck),
      rows,
    });
  }

  if (!sections.length) {
    return {
      ok: false,
      code: 'SWAP_GLANCE_EMPTY',
      message: 'No swaps to include for the selected filters and options.',
    };
  }

  return {
    ok: true,
    includeSet: { mode, includeSeeking, filterSetCodes, sections },
  };
}
