import {
  applyDeckPatch,
  SEEKING,
  SWAP_IN,
  type DeckDocument,
  type DeckPatch,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { saveDualMode } from '../deck-builder/store/deck-dual-mode';
import { resolveLibraryDocument } from '../deck-builder/store/library-sync';
import { apiFetch } from '../api/hub-api';
import type { Suggestion } from './types';

export type AcceptPrintingChoice = {
  printing: PrintingFields;
  proxy?: boolean;
};

function mintId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function cardFieldsFromChoice(choice: AcceptPrintingChoice) {
  const { printing, proxy } = choice;
  return {
    setCode: printing.setCode || null,
    collectorNumber: printing.collectorNumber || null,
    scryfallId: printing.scryfallId || null,
    foil: Boolean(printing.foil),
    proxy: Boolean(proxy),
  };
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
  choice?: AcceptPrintingChoice,
  meta?: { inTargetCategory?: string | null; notes?: string },
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
  const fields = choice
    ? cardFieldsFromChoice(choice)
    : {
        setCode: suggestion.card.set_code || null,
        collectorNumber: suggestion.card.collector_number || null,
        scryfallId: suggestion.card.scryfall_id || null,
        foil: false,
        proxy: false,
      };
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
          ...fields,
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
          inTargetCategory: meta?.inTargetCategory ?? null,
          notes: meta?.notes?.trim() ? meta.notes.trim() : null,
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

export function buildSeekingAcceptPatch(
  deck: DeckDocument,
  suggestion: Suggestion,
  choice?: AcceptPrintingChoice,
): DeckPatch {
  const existing = deck.cards.find(
    (c) => c.name.toLowerCase() === suggestion.card.name.toLowerCase(),
  );
  const inId = existing?.instanceId || mintId('c');
  const fields = choice
    ? cardFieldsFromChoice(choice)
    : {
        setCode: suggestion.card.set_code || null,
        collectorNumber: suggestion.card.collector_number || null,
        scryfallId: suggestion.card.scryfall_id || null,
        foil: false,
        proxy: false,
      };
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
          ...fields,
          quantity: 1,
        },
      },
    ];
  } else if (choice) {
    ops.cardOps = [
      {
        op: 'update',
        instanceId: inId,
        patch: fields,
      },
    ];
  }
  return ops;
}

export async function persistSuggestPatch(deckId: string, patch: DeckPatch): Promise<DeckDocument> {
  const local = await resolveLibraryDocument(deckId);
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

/** Match a review cut selection to a Hub card instance (set/collector preferred, else name). */
export function resolveOutInstanceId(
  deck: DeckDocument,
  out: { name: string; set_code?: string | null; collector_number?: string | null },
): string | null {
  const name = String(out.name || '')
    .trim()
    .toLowerCase();
  if (!name) {
    return null;
  }
  const candidates = (deck.cards || []).filter((c) => c.name.toLowerCase() === name);
  if (!candidates.length) {
    return null;
  }
  const setCode = String(out.set_code || '')
    .trim()
    .toLowerCase();
  const collector = String(out.collector_number || '').trim();
  if (setCode && collector) {
    const exact = candidates.find(
      (c) =>
        String(c.setCode || '')
          .toLowerCase() === setCode && String(c.collectorNumber || '') === collector,
    );
    if (exact) {
      return exact.instanceId;
    }
  }
  return candidates[0].instanceId;
}

function choiceFromCardIn(cardIn: {
  name: string;
  set_code?: string;
  collector_number?: string;
  scryfall_id?: string;
  finish?: string;
}): AcceptPrintingChoice {
  return {
    printing: {
      name: cardIn.name,
      scryfallId: cardIn.scryfall_id || '',
      setCode: cardIn.set_code || '',
      collectorNumber: cardIn.collector_number || '',
      typeLine: null,
      colourIdentity: [],
      layout: null,
      foil: cardIn.finish === 'foil',
      printedName: null,
      flavorName: null,
      manaValue: null,
    },
  };
}

/** Persist an accepted Swap/Seeking decision to the Hub deck (system of record). */
export async function persistAcceptedSuggestion(
  suggestion: Suggestion,
  accepted: {
    deck_id: string;
    accept_kind?: 'swap' | 'seeking';
    card_in: {
      name: string;
      set_code?: string;
      collector_number?: string;
      scryfall_id?: string;
      finish?: string;
    };
    card_out?: { name: string; set_code?: string | null; collector_number?: string | null } | null;
  },
): Promise<DeckDocument> {
  const deckId = accepted.deck_id;
  if (!deckId) {
    throw new Error('Missing deck id.');
  }
  const local = await resolveLibraryDocument(deckId);
  if (!local) {
    throw new Error('Save this deck to Hub before accepting suggestions.');
  }
  const choice = choiceFromCardIn(accepted.card_in);
  const seeking = accepted.accept_kind === 'seeking' || !accepted.card_out?.name;
  if (seeking) {
    return persistSuggestPatch(deckId, buildSeekingAcceptPatch(local, suggestion, choice));
  }
  const outId = resolveOutInstanceId(local, accepted.card_out!);
  if (!outId) {
    throw new Error('Could not find Out card "' + accepted.card_out!.name + '" on Hub deck.');
  }
  return persistSuggestPatch(deckId, buildSwapAcceptPatch(local, suggestion, outId, choice));
}

export type SessionAccept = {
  deckId: string;
  cardName: string;
  quantity: number;
  printing?: { set_code?: string; collector_number?: string };
  kind: 'queued_in' | 'seeking';
};
