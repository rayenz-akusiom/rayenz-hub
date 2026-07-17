import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { ProfileSync } from '../mtg/profile-sync';
import type { DeckPrefs, DeckReviewState } from './types';

function listHasName(list: string[] | null | undefined, name: string): boolean {
  return (list || []).some((item) => item === name);
}

function uniqueNames(...lists: Array<string[] | null | undefined>): string[] {
  const seen: Record<string, boolean> = {};
  const names: string[] = [];
  for (let i = 0; i < lists.length; i++) {
    (lists[i] || []).forEach((name) => {
      if (name && !seen[name]) {
        seen[name] = true;
        names.push(name);
      }
    });
  }
  return names;
}

export function getDeckPreferences(deck: DeckEntry, deckPrefs: Record<string, DeckPrefs>): DeckPrefs {
  const base = deck.profile_preferences || { blocked_cards: [], protected_cards: [] };
  const runtime = deckPrefs[deck.deck_id || ''] || { blocked_cards: [], protected_cards: [] };
  return {
    blocked_cards: uniqueNames(base.blocked_cards, runtime.blocked_cards),
    protected_cards: uniqueNames(base.protected_cards, runtime.protected_cards),
  };
}

export function addRuntimePreference(
  deckPrefs: Record<string, DeckPrefs>,
  deckId: string,
  field: 'blocked_cards' | 'protected_cards',
  cardName: string,
): Record<string, DeckPrefs> {
  if (!cardName) {
    return deckPrefs;
  }
  const next = { ...deckPrefs };
  if (!next[deckId]) {
    next[deckId] = { blocked_cards: [], protected_cards: [] };
  }
  const list = [...(next[deckId][field] || [])];
  if (!listHasName(list, cardName)) {
    list.push(cardName);
    next[deckId] = { ...next[deckId], [field]: list };
  }
  return next;
}

export function isSuggestionFiltered(suggestion: Suggestion, prefs: DeckPrefs): boolean {
  if (!suggestion || !prefs) {
    return false;
  }
  const card = suggestion.card as { name?: string } | undefined;
  if (card?.name && listHasName(prefs.blocked_cards, card.name)) {
    return true;
  }
  return ((suggestion.replaces || []) as Array<{ name?: string }>).some(
    (r) => r.name && listHasName(prefs.protected_cards, r.name),
  );
}

export function canWriteProfiles(): boolean {
  return ProfileSync.canWriteProfiles();
}

export function canConnectProfilesFolder(): boolean {
  return ProfileSync.canWriteProfilesViaDirectory();
}

export async function connectProfilesDir(): Promise<void> {
  await ProfileSync.connectProfilesDir();
}

export async function checkProfilesConnected(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') {
    return false;
  }
  return ProfileSync.isConnected();
}

export function selectedInCardName(
  suggestion: Suggestion,
  printId: string,
  prints: Array<{ id: string; name?: string }>,
): string {
  const card = suggestion.card as { name: string };
  const print = prints.find((p) => p.id === printId);
  return (print?.name || card.name) as string;
}

export async function neverSuggestAgain(
  deck: DeckEntry,
  suggestion: Suggestion,
  side: 'in' | 'out',
  inCardName: string,
  outCardName: string,
): Promise<{ ok: true; cardName: string; field: 'blocked_cards' | 'protected_cards'; changed: boolean } | { ok: false; error: string }> {
  if (!ProfileSync.canWriteProfiles()) {
    return { ok: false, error: 'Profile updates require a configured Hub API or desktop Chrome on PC.' };
  }

  const field = side === 'in' ? 'blocked_cards' : 'protected_cards';
  const cardName = side === 'in' ? inCardName : outCardName;

  if (!cardName) {
    return { ok: false, error: 'Select a card first.' };
  }

  try {
    const result = await ProfileSync.appendToProfileList(deck.deck_id || '', field, cardName);
    return { ok: true, cardName, field, changed: result.changed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function prefCountsLabel(deck: DeckEntry | null, deckPrefs: Record<string, DeckPrefs>): string {
  if (!deck) {
    return '';
  }
  const prefs = getDeckPreferences(deck, deckPrefs);
  return prefs.blocked_cards.length + ' blocked · ' + prefs.protected_cards.length + ' protected';
}

export type ProfilePatch = Partial<Pick<DeckReviewState, 'deckPrefs' | 'profilesConnected' | 'profileStatus'>>;
