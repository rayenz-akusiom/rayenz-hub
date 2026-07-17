import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { isApiConfigured } from '../api/hub-api';
import {
  deckBuilderHash,
  HUB_USER_SLUG,
  normalizeHash,
  parseDeckBuilderRoute,
} from '../hub/routes';
import { navigateHub } from '../lib/hub-storage';
import { toKebabCase } from '../lib/string-utils';
import { LibraryView } from './library/LibraryView';
import { AddDeckDialog } from './library/AddDeckDialog';
import { BrowseShell } from './browse/BrowseShell';
import * as store from './store/deck-store';
import * as deckApi from './store/deck-api';

async function saveDualMode(doc: DeckDocument): Promise<{ saved: DeckDocument; apiError?: string }> {
  const saved = await store.saveDeck(doc);
  if (isApiConfigured()) {
    try {
      await deckApi.apiPutDeck(saved);
    } catch (e) {
      return { saved, apiError: e instanceof Error ? e.message : String(e) };
    }
  }
  return { saved };
}

async function deleteDualMode(deckId: string): Promise<{ apiError?: string }> {
  await store.deleteDeck(deckId);
  if (isApiConfigured()) {
    try {
      await deckApi.apiDeleteDeck(deckId);
    } catch (e) {
      return { apiError: e instanceof Error ? e.message : String(e) };
    }
  }
  return {};
}

function syncDeckHash(doc: DeckDocument | null): void {
  const next = doc
    ? deckBuilderHash(HUB_USER_SLUG, toKebabCase(doc.name))
    : deckBuilderHash();
  if (normalizeHash(window.location.hash) !== normalizeHash(next)) {
    navigateHub(next);
  }
}

export function DeckBuilderApp() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [active, setActive] = useState<DeckDocument | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const persistSeq = useRef(0);
  const decksRef = useRef<DeckSummary[]>([]);
  const activeRef = useRef<DeckDocument | null>(null);
  const applyingRouteRef = useRef(false);

  useEffect(() => {
    decksRef.current = decks;
  }, [decks]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const openDeck = useCallback(async (deckId: string, opts?: { syncHash?: boolean }) => {
    setError(null);
    const doc = await store.getDeck(deckId);
    if (!doc) {
      setError('Deck not found in local store');
      return;
    }
    setActive(doc);
    if (opts?.syncHash !== false) syncDeckHash(doc);
  }, []);

  const applyRouteFromHash = useCallback(
    async (list: DeckSummary[]) => {
      const route = parseDeckBuilderRoute(window.location.hash);
      if (!route) {
        if (activeRef.current) setActive(null);
        return;
      }
      if (route.userSlug !== HUB_USER_SLUG) {
        setError(`Unknown user “${route.userSlug}”`);
        setActive(null);
        return;
      }
      const match = list.find((d) => toKebabCase(d.name) === route.deckSlug);
      if (!match) {
        setError('Deck not found');
        setActive(null);
        return;
      }
      if (activeRef.current?.deckId === match.deckId) {
        setError(null);
        return;
      }
      applyingRouteRef.current = true;
      try {
        await openDeck(match.deckId, { syncHash: false });
      } finally {
        applyingRouteRef.current = false;
      }
    },
    [openDeck],
  );

  const refreshLibrary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let list = await store.listDecks();
      if (isApiConfigured()) {
        try {
          const remote = await deckApi.apiListDecks();
          const byId = new Map(list.map((d) => [d.deckId, d]));
          for (const r of remote) {
            const local = byId.get(r.deckId);
            if (!local || r.updatedAt >= local.updatedAt) {
              byId.set(r.deckId, {
                ...r,
                coverImageUrl: r.coverImageUrl || local?.coverImageUrl || null,
                coverImageUrlSecondary:
                  r.coverImageUrlSecondary || local?.coverImageUrlSecondary || null,
                coverPartnerStatus: r.coverPartnerStatus ?? local?.coverPartnerStatus ?? null,
              });
              const full = await deckApi.apiGetDeck(r.deckId);
              if (full) {
                const merged = store.mergeDeckDocuments(await store.getDeck(r.deckId), full);
                if (merged) await store.saveDeck(merged);
              }
            }
          }
          list = [...byId.values()].sort(
            (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name),
          );
        } catch (e) {
          setApiWarning(e instanceof Error ? e.message : String(e));
        }
      }
      setDecks(list);
      await applyRouteFromHash(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [applyRouteFromHash]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    function onHashChange() {
      if (applyingRouteRef.current) return;
      void applyRouteFromHash(decksRef.current);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [applyRouteFromHash]);

  async function persist(next: DeckDocument) {
    const seq = ++persistSeq.current;
    setActive(next);
    setApiWarning(null);
    const { saved, apiError } = await saveDualMode(next);
    if (seq !== persistSeq.current) return;
    setActive(saved);
    syncDeckHash(saved);
    if (apiError) setApiWarning(apiError);
    await refreshLibrary();
  }

  async function removeDeck(deckId: string) {
    setApiWarning(null);
    const { apiError } = await deleteDualMode(deckId);
    if (active?.deckId === deckId) {
      setActive(null);
      syncDeckHash(null);
    }
    if (apiError) setApiWarning(apiError);
    await refreshLibrary();
  }

  if (active) {
    return (
      <div className="db-app">
        {apiWarning ? <p className="db-warn">{apiWarning}</p> : null}
        <BrowseShell
          deck={active}
          onBack={() => {
            setActive(null);
            syncDeckHash(null);
            void refreshLibrary();
          }}
          onChange={(next) => {
            void persist(next);
          }}
        />
      </div>
    );
  }

  return (
    <div className="db-app">
      <LibraryView
        decks={decks}
        loading={loading}
        error={error}
        onOpen={(id) => void openDeck(id)}
        onAdd={() => setAddOpen(true)}
        onDelete={(id) => void removeDeck(id)}
        onRefreshRemote={isApiConfigured() ? () => void refreshLibrary() : undefined}
      />
      {addOpen ? (
        <AddDeckDialog
          onClose={() => setAddOpen(false)}
          onSave={async (doc) => {
            await persist(doc);
            const saved = await store.getDeck(doc.deckId);
            setActive(saved);
            if (saved) syncDeckHash(saved);
          }}
        />
      ) : null}
    </div>
  );
}
