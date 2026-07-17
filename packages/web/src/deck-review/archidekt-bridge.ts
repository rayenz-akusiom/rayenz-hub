import { bridgeAvailable, bridgeApplyAvailable, sleep } from '../lib/hub-utils';
import { ArchidektExport } from '../mtg/archidekt-export';
import type { DeckEntry } from '@rayenz-hub/shared';
import type { HubProgressController } from '../lib/hub-progress';

type ArchidektBridge = {
  fetchDeckSnapshot?: (deckId: number) => Promise<unknown>;
  stageApply?: (deckId: number, text: string) => void;
};

function archidektBridge(): ArchidektBridge | undefined {
  return (window as Window & { RayenzArchidektBridge?: ArchidektBridge }).RayenzArchidektBridge;
}

export function refreshDeckSnapshot(deck: DeckEntry): Promise<unknown> {
  if (!bridgeAvailable()) {
    return Promise.reject(new Error('Archidekt bridge userscript not installed'));
  }
  const deckId = ArchidektExport.parseDeckId(deck.archidekt_url);
  if (!deckId) {
    return Promise.reject(new Error('Invalid Archidekt URL for ' + (deck.deck_name || deck.deck_id)));
  }
  const bridge = archidektBridge();
  if (!bridge?.fetchDeckSnapshot) {
    return Promise.reject(new Error('Archidekt bridge userscript not installed'));
  }
  return bridge.fetchDeckSnapshot(deckId).then((snapshot) => {
    deck.deck_snapshot = snapshot as DeckEntry['deck_snapshot'];
    return snapshot;
  });
}

export async function refreshAllDeckSnapshots(
  decks: DeckEntry[],
  progress: HubProgressController | null,
  onComplete: (updatedDecks: DeckEntry[]) => void,
  onError: (message: string) => void,
): Promise<void> {
  if (!bridgeAvailable()) {
    onError('Install Archidekt Deck Review Bridge userscript for live refresh.');
    return;
  }
  if (!decks.length) {
    return;
  }
  progress?.start({ label: 'Refreshing decks from Archidekt…' });
  const updated = decks.slice();
  for (let i = 0; i < updated.length; i++) {
    progress?.update({
      current: i + 1,
      total: updated.length,
      label: 'Refreshing Archidekt (' + (i + 1) + '/' + updated.length + '): ' + updated[i].deck_name + '…',
    });
    try {
      await refreshDeckSnapshot(updated[i]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      progress?.finish({ label: 'Refresh failed for ' + updated[i].deck_name + ': ' + msg, variant: 'error' });
      onError(msg);
      return;
    }
    if (i < updated.length - 1) {
      await sleep(150);
    }
  }
  progress?.finish({ label: 'Refreshed ' + updated.length + ' decks from Archidekt.' });
  onComplete(updated);
}

export async function refreshActiveDeckSnapshot(
  deck: DeckEntry,
  progress: HubProgressController | null,
): Promise<DeckEntry> {
  progress?.start({ label: 'Refreshing ' + deck.deck_name + '…', indeterminate: true });
  try {
    await refreshDeckSnapshot(deck);
    progress?.finish({ label: 'Refreshed ' + deck.deck_name + ' from Archidekt.' });
    return deck;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress?.finish({ label: msg, variant: 'error' });
    throw err;
  }
}

export function stageDeckApply(deck: DeckEntry, importText: string): { deckId: number; url: string } | { error: string } {
  if (!bridgeApplyAvailable()) {
    return { error: 'Install/update Archidekt Deck Review Bridge userscript (2026-06-21.4+) to apply from Hub.' };
  }
  const deckId = ArchidektExport.parseDeckId(deck.archidekt_url);
  if (!deckId || !importText.trim()) {
    return { error: 'Cannot stage apply — missing deck id or import text.' };
  }
  const bridge = archidektBridge();
  try {
    bridge?.stageApply?.(deckId, importText);
    return { deckId, url: deck.archidekt_url || '' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export { bridgeAvailable, bridgeApplyAvailable };
