import { hasMaybeboardOnlySwapQueue, isCubeDeck, type DeckWithSnapshot } from '@rayenz-hub/shared';
import type { DeckRecord } from './types';

export function resolveDeckEligibility(deck: DeckRecord) {
  const profile = deck.profile || {};
  const format = profile.format || deck.format;
  if (deck.ownership === 'theory') {
    return {
      eligible: false,
      reason: 'theory_deck',
      message: deck.deck_name + ': skipped (theory deck).',
    };
  }
  if (format && format !== 'commander') {
    return {
      eligible: false,
      reason: 'non_commander_format',
      message: deck.deck_name + ': skipped (profile format is ' + format + ').',
    };
  }
  if (isCubeDeck({ name: deck.deck_name, format, deckName: deck.deck_name })) {
    return {
      eligible: false,
      reason: 'cube_or_non_commander',
      message: deck.deck_name + ': skipped (cube deck — out of scope for v1).',
    };
  }
  if (hasMaybeboardOnlySwapQueue(deck.deck_snapshot as DeckWithSnapshot['deck_snapshot'])) {
    return {
      eligible: false,
      reason: 'maybeboard_swap_queue',
      message: deck.deck_name + ': skipped (Maybeboard-only swap queue).',
    };
  }
  if (format === 'commander') {
    return { eligible: true, format: 'commander' };
  }
  return { eligible: true, format: 'commander', inferred: true };
}
