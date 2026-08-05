import type { DeckDocument, FormalSwapEntry, LookingForEntry } from '@rayenz-hub/shared';
import { cardDisplayName, getOracle, resolveCardView } from '@rayenz-hub/shared';

function cardName(deck: DeckDocument, instanceId: string | null | undefined): string | null {
  if (!instanceId) return null;
  const card = (deck.cards || []).find((c) => c.instanceId === instanceId);
  if (!card) return instanceId;
  const oracle = getOracle(deck, card);
  const view = resolveCardView(card, oracle);
  return cardDisplayName(view);
}

export type DeckSummaryForAgent = {
  deckId: string;
  name: string;
  format: DeckDocument['format'];
  /** owned = physical; theory = speculative (no acquire/trade / cascade). */
  ownership: 'owned' | 'theory';
  archidektId: number | null;
  archidektUrl: string | null;
  cardCount: number;
  commanders: string[];
  colourIdentity: string[];
  categoryCounts: Record<string, number>;
  proxyCount: number;
  proxyNames: string[];
  formalSwaps: {
    total: number;
    complete: number;
    incomplete: number;
    entries: Array<{
      id: string;
      inName: string | null;
      outName: string | null;
      inTargetCategory: string | null;
      notes: string | null;
    }>;
  };
  lookingFor: Array<{ id: string; name: string | null; notes: string | null }>;
  protectedCards: string[];
  profileKey: string | null;
};

function commandersOf(deck: DeckDocument): string[] {
  return (deck.cards || [])
    .filter((c) => c.primaryCategory === 'Commander' || (c.categories || []).includes('Commander'))
    .map((c) => {
      const oracle = getOracle(deck, c);
      return cardDisplayName(resolveCardView(c, oracle));
    });
}

function colourIdentityOf(deck: DeckDocument): string[] {
  const letters = new Set<string>();
  for (const c of deck.cards || []) {
    if (c.primaryCategory !== 'Commander' && !(c.categories || []).includes('Commander')) {
      continue;
    }
    const oracle = getOracle(deck, c);
    const ci = oracle?.colourIdentity || [];
    for (const L of ci) letters.add(L);
  }
  return ['W', 'U', 'B', 'R', 'G'].filter((L) => letters.has(L));
}

function categoryCounts(deck: DeckDocument): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of deck.cards || []) {
    const cat = c.primaryCategory || 'Unknown';
    const qty = typeof c.quantity === 'number' && c.quantity > 0 ? c.quantity : 1;
    counts[cat] = (counts[cat] || 0) + qty;
  }
  return counts;
}

function mapSwapEntries(deck: DeckDocument, entries: FormalSwapEntry[]) {
  const sorted = [...(entries || [])].sort((a, b) => a.sortIndex - b.sortIndex);
  let complete = 0;
  let incomplete = 0;
  const mapped = sorted.map((e) => {
    const ok = Boolean(e.inInstanceId && e.outInstanceId);
    if (ok) complete += 1;
    else incomplete += 1;
    return {
      id: e.id,
      inName: cardName(deck, e.inInstanceId),
      outName: cardName(deck, e.outInstanceId),
      inTargetCategory: e.inTargetCategory ?? null,
      notes: e.notes ?? null,
    };
  });
  return { total: mapped.length, complete, incomplete, entries: mapped };
}

function mapLookingFor(deck: DeckDocument, entries: LookingForEntry[]) {
  return [...(entries || [])]
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((e) => ({
      id: e.id,
      name: cardName(deck, e.instanceId),
      notes: e.notes ?? null,
    }));
}

export function summarizeDeck(
  deck: DeckDocument,
  opts?: { protectedCards?: string[]; profileKey?: string | null },
): DeckSummaryForAgent {
  const proxies = (deck.cards || []).filter((c) => c.proxy);
  return {
    deckId: deck.deckId,
    name: deck.name,
    format: deck.format,
    ownership: deck.ownership === 'theory' ? 'theory' : 'owned',
    archidektId: deck.archidektId ?? null,
    archidektUrl: deck.archidektUrl ?? null,
    cardCount: (deck.cards || []).reduce(
      (n, c) => n + (typeof c.quantity === 'number' && c.quantity > 0 ? c.quantity : 1),
      0,
    ),
    commanders: commandersOf(deck),
    colourIdentity: colourIdentityOf(deck),
    categoryCounts: categoryCounts(deck),
    proxyCount: proxies.length,
    proxyNames: proxies.map((c) => {
      const oracle = getOracle(deck, c);
      return cardDisplayName(resolveCardView(c, oracle));
    }),
    formalSwaps: mapSwapEntries(deck, deck.formalSwapEntries || []),
    lookingFor: mapLookingFor(deck, deck.lookingForEntries || []),
    protectedCards: opts?.protectedCards || [],
    profileKey: opts?.profileKey ?? null,
  };
}

export function listSwapsResolved(deck: DeckDocument) {
  return {
    deckId: deck.deckId,
    name: deck.name,
    ownership: deck.ownership === 'theory' ? 'theory' : 'owned',
    formalSwapEntries: mapSwapEntries(deck, deck.formalSwapEntries || []).entries,
    lookingForEntries: mapLookingFor(deck, deck.lookingForEntries || []),
  };
}
