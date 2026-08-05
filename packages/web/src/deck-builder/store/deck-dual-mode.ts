import type { DeckDocument } from '@rayenz-hub/shared';
import { isApiConfigured } from '../../api/hub-api';
import {
  dismissSampleDeck,
  isSampleDeckId,
} from '../sample/sample-deck';
import * as deckApi from './deck-api';
import * as store from './deck-store';

/** Local IndexedDB save, then optional Hub API put when configured. */
export async function saveDualMode(
  doc: DeckDocument,
): Promise<{ saved: DeckDocument; apiError?: string }> {
  const saved = await store.saveDeck(doc);
  if (isSampleDeckId(doc.deckId)) {
    return { saved };
  }
  if (isApiConfigured()) {
    try {
      const remote = await deckApi.apiPutDeck(saved);
      // Deployed APIs that omit CategoryDef.target / ownership still bump updatedAt;
      // keep Hub fields and re-save so local clock stays ahead of remote.
      const reconciled = store.reconcileDeckAfterApiPut(saved, remote);
      if (
        reconciled.updatedAt !== saved.updatedAt ||
        reconciled.ownership !== saved.ownership ||
        JSON.stringify(reconciled.categories) !== JSON.stringify(saved.categories)
      ) {
        return { saved: await store.saveDeck(reconciled) };
      }
    } catch (e) {
      return { saved, apiError: e instanceof Error ? e.message : String(e) };
    }
  }
  return { saved };
}

/** Local delete, then optional Hub API delete when configured. */
export async function deleteDualMode(deckId: string): Promise<{ apiError?: string }> {
  await store.deleteDeck(deckId);
  if (isSampleDeckId(deckId)) {
    dismissSampleDeck();
    return {};
  }
  if (isApiConfigured()) {
    try {
      await deckApi.apiDeleteDeck(deckId);
    } catch (e) {
      return { apiError: e instanceof Error ? e.message : String(e) };
    }
  }
  return {};
}
