import {
  applyDeckPatch,
  SEEKING,
  SWAP_IN,
  type DeckDocument,
  type DeckPatch,
} from '@rayenz-hub/shared';
import { getDeck } from '../deck-builder/store/deck-store';
import { saveDualMode } from '../deck-builder/store/deck-dual-mode';
import { apiGetDeck } from '../deck-builder/store/deck-api';
import { apiFetch } from '../api/hub-api';
import type { Suggestion } from './types';

function mintId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function legalOutCards(
  deck: DeckDocument,
  protectedNames: string[] = [],
): Array<{ instanceId: string; name: string }> {
  const protectedCats = new Set(['Commander', 'Lieutenant', 'Lieutenants']);
  const blocked = new Set(protectedNames.map((n) => n.toLowerCase()));
  return (deck.cards || [])
    .filter((c) => !protectedCats.has(c.primaryCategory))
    .filter((c) => c.primaryCategory !== SWAP_IN)
    .filter((c) => !blocked.has(c.name.toLowerCase()))
    .map((c) => ({ instanceId: c.instanceId, name: c.name }));
}

export function buildSwapAcceptPatch(
  deck: DeckDocument,
  suggestion: Suggestion,
  outInstanceId: string,
): DeckPatch {
  const out = deck.cards.find((c) => c.instanceId === outInstanceId);
  if (!out) {
    throw new Error('Choose a valid Out card.');
  }
  const inId = mintId('c');
  const lookingForToClear = (deck.lookingForEntries || []).filter((e) => {
    const card = deck.cards.find((c) => c.instanceId === e.instanceId);
    return card && card.name.toLowerCase() === suggestion.card.name.toLowerCase();
  });
  return {
    expectedUpdatedAt: deck.updatedAt,
    cardOps: [
      {
        op: 'add',
        card: {
          instanceId: inId,
          name: suggestion.card.name,
          primaryCategory: SWAP_IN,
          categories: [SWAP_IN],
          setCode: suggestion.card.set_code || null,
          collectorNumber: suggestion.card.collector_number || null,
          scryfallId: suggestion.card.scryfall_id || null,
          quantity: 1,
        },
      },
    ],
    formalSwapOps: [
      {
        op: 'add',
        entry: {
          inInstanceId: inId,
          outInstanceId,
          inTargetCategory: null,
          sortIndex: (deck.formalSwapEntries || []).length,
        },
      },
    ],
    lookingForOps:
      lookingForToClear.length > 0
        ? lookingForToClear.map((e) => ({ op: 'remove' as const, id: e.id }))
        : undefined,
  };
}

export function buildSeekingAcceptPatch(deck: DeckDocument, suggestion: Suggestion): DeckPatch {
  const existing = deck.cards.find(
    (c) => c.name.toLowerCase() === suggestion.card.name.toLowerCase(),
  );
  const inId = existing?.instanceId || mintId('c');
  const ops: DeckPatch = {
    expectedUpdatedAt: deck.updatedAt,
    lookingForOps: [
      {
        op: 'add',
        entry: {
          instanceId: inId,
          sortIndex: (deck.lookingForEntries || []).length,
        },
      },
    ],
  };
  if (!existing) {
    ops.cardOps = [
      {
        op: 'add',
        card: {
          instanceId: inId,
          name: suggestion.card.name,
          primaryCategory: SEEKING,
          categories: [SEEKING],
          setCode: suggestion.card.set_code || null,
          collectorNumber: suggestion.card.collector_number || null,
          scryfallId: suggestion.card.scryfall_id || null,
          quantity: 1,
        },
      },
    ];
  }
  return ops;
}

export async function persistSuggestPatch(deckId: string, patch: DeckPatch): Promise<DeckDocument> {
  const local = (await getDeck(deckId)) || (await apiGetDeck(deckId));
  if (!local) {
    throw new Error('Save this deck to Hub before accepting suggestions.');
  }
  const next = applyDeckPatch(local, { ...patch, expectedUpdatedAt: local.updatedAt });
  const { saved, apiError } = await saveDualMode(next);
  if (apiError) {
    try {
      await apiFetch(`/v1/decks/${encodeURIComponent(deckId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    } catch {
      throw new Error(apiError);
    }
  }
  return saved;
}

export type SessionAccept = {
  deckId: string;
  cardName: string;
  quantity: number;
  printing?: { set_code?: string; collector_number?: string };
  kind: 'queued_in' | 'seeking';
};
