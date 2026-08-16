import { buildArchidektWantsText, buildNameQtyWantsText, type WantSource } from '@rayenz-hub/shared';
import type { SessionAccept } from './accept';

export function sessionAcceptsToWantSources(accepts: SessionAccept[]): WantSource[] {
  return accepts.map((a, i) => ({
    deckId: a.deckId,
    deckName: a.deckId,
    format: 'commander',
    kind: a.kind === 'seeking' ? 'seeking' : 'queued_in',
    entryId: `session-${i}`,
    cardInstanceId: `session-${i}`,
    cardName: a.cardName,
    mergeKey: a.cardName.toLowerCase(),
    quantity: a.quantity || 1,
    usd: null,
    setCode: a.printing?.set_code || null,
    collectorNumber: a.printing?.collector_number || null,
    foil: false,
    outInstanceId: null,
    inInstanceId: null,
    pairIncomplete: false,
  }));
}

export function buildSessionWishlistText(accepts: SessionAccept[]): string {
  if (!accepts.length) return '';
  const sources = sessionAcceptsToWantSources(accepts);
  return buildArchidektWantsText(sources) || buildNameQtyWantsText(sources);
}
