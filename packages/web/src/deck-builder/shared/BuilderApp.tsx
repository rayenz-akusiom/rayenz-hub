import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { filterLibraryByFormat } from '@rayenz-hub/shared';
import { isApiConfigured } from '../../api/hub-api';
import {
  builderHash,
  builderBasePath,
  HUB_USER_SLUG,
  normalizeHash,
  parseBuilderRoute,
  type BuilderFormat,
} from '../../hub/routes';
import { navigateHub } from '../../lib/hub-storage';
import { toKebabCase } from '../../lib/string-utils';
import { BrowseShell } from '../browse/BrowseShell';
import { FormatFilteredLibrary } from './library/FormatFilteredLibrary';
import * as store from '../store/deck-store';
import * as deckApi from '../store/deck-api';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';

export type CreateDialogProps = {
  onClose: () => void;
  onSave: (doc: DeckDocument) => Promise<void>;
  formatMismatchWarning?: string | null;
  onMismatchWarning?: (message: string | null) => void;
};

async function saveDualMode(doc: DeckDocument): Promise<{ saved: DeckDocument; apiError?: string }> {
  const saved = await store.saveDeck(doc);
  if (isApiConfigured()) {
    try {
      const remote = await deckApi.apiPutDeck(saved);
      // Deployed APIs that omit CategoryDef.target still bump updatedAt; keep Hub targets
      // and re-save so local clock stays ahead of remote and refreshLibrary won't wipe IDB.
      const reconciled = store.reconcileDeckAfterApiPut(saved, remote);
      if (
        reconciled.updatedAt !== saved.updatedAt ||
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

function otherBuilderFormat(format: BuilderFormat): BuilderFormat {
  return format === 'commander' ? 'cube' : 'commander';
}

function hashUsesOtherBuilder(hash: string, builderFormat: BuilderFormat): boolean {
  const normalized = normalizeHash(hash).slice(1);
  const otherBase = builderBasePath(otherBuilderFormat(builderFormat));
  return normalized === otherBase || normalized.startsWith(`${otherBase}/`);
}

/** Sync index hit for the current builder deep-link hash, if any. */
function deepLinkIndexMatch(builderFormat: BuilderFormat): DeckSummary | null {
  const route = parseBuilderRoute(window.location.hash, builderFormat);
  if (!route || route.userSlug !== HUB_USER_SLUG) return null;
  const match = store.readLibraryIndex().find((d) => toKebabCase(d.name) === route.deckSlug);
  if (!match || match.format !== builderFormat) return null;
  return match;
}

export function BuilderApp({
  builderFormat,
  title,
  addLabel,
  CreateDialog,
}: {
  builderFormat: BuilderFormat;
  title: string;
  addLabel?: string;
  CreateDialog: ComponentType<CreateDialogProps>;
}) {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [active, setActive] = useState<DeckDocument | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<DeckSyncStatus | null>(null);
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
  const persistSeq = useRef(0);
  const openSeq = useRef(0);
  const decksRef = useRef<DeckSummary[]>([]);
  const activeRef = useRef<DeckDocument | null>(null);
  const applyingRouteRef = useRef(false);

  const filteredDecks = filterLibraryByFormat(decks, builderFormat);

  useEffect(() => {
    decksRef.current = decks;
  }, [decks]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const syncDeckHash = useCallback(
    (doc: DeckDocument | null) => {
      const next = doc
        ? builderHash(builderFormat, HUB_USER_SLUG, toKebabCase(doc.name))
        : builderHash(builderFormat);
      if (normalizeHash(window.location.hash) !== normalizeHash(next)) {
        navigateHub(next);
      }
    },
    [builderFormat],
  );

  const redirectToCorrectBuilder = useCallback((doc: DeckDocument) => {
    const targetFormat: BuilderFormat = doc.format === 'cube' ? 'cube' : 'commander';
    if (targetFormat === builderFormat) return false;
    navigateHub(builderHash(targetFormat, HUB_USER_SLUG, toKebabCase(doc.name)));
    return true;
  }, [builderFormat]);

  const openDeck = useCallback(
    async (deckId: string, opts?: { syncHash?: boolean }) => {
      setError(null);
      const doc = await store.getDeck(deckId);
      if (!doc) {
        setError('Deck not found in local store');
        return;
      }
      if (redirectToCorrectBuilder(doc)) return;

      // Local-first: paint BrowseShell before optional API sync.
      setActive(doc);
      activeRef.current = doc;
      if (opts?.syncHash !== false) {
        applyingRouteRef.current = true;
        try {
          syncDeckHash(doc);
        } finally {
          applyingRouteRef.current = false;
        }
      }

      if (!isApiConfigured()) {
        setSyncStatus(null);
        return;
      }

      // Skip 'syncing' on open — jump straight to a terminal status to avoid charm flash.
      const openGen = ++openSeq.current;
      try {
        const remote = await deckApi.apiGetDeck(deckId);
        if (openGen !== openSeq.current || activeRef.current?.deckId !== deckId) return;
        if (remote == null) {
          const { saved, apiError } = await saveDualMode(doc);
          if (openGen !== openSeq.current || activeRef.current?.deckId !== deckId) return;
          setActive(saved);
          activeRef.current = saved;
          if (apiError) {
            setApiWarning(apiError);
            setSyncStatus('local');
          } else {
            setApiWarning(null);
            setSyncStatus('synced');
          }
        } else {
          setSyncStatus('synced');
        }
      } catch (e) {
        if (openGen !== openSeq.current || activeRef.current?.deckId !== deckId) return;
        setApiWarning(e instanceof Error ? e.message : String(e));
        setSyncStatus('error');
      }
    },
    [redirectToCorrectBuilder, syncDeckHash],
  );

  function invalidatePersist() {
    persistSeq.current += 1;
  }

  const applyRouteFromHash = useCallback(
    async (list: DeckSummary[]) => {
      const hash = window.location.hash;
      if (hashUsesOtherBuilder(hash, builderFormat)) {
        return;
      }

      const route = parseBuilderRoute(hash, builderFormat);
      if (!route) {
        if (activeRef.current) {
          invalidatePersist();
          activeRef.current = null;
          setActive(null);
          setSyncStatus(null);
        }
        return;
      }
      if (route.userSlug !== HUB_USER_SLUG) {
        setError(`Unknown user “${route.userSlug}”`);
        activeRef.current = null;
        setActive(null);
        setSyncStatus(null);
        return;
      }
      const match = list.find((d) => toKebabCase(d.name) === route.deckSlug);
      if (!match) {
        if (activeRef.current && toKebabCase(activeRef.current.name) === route.deckSlug) {
          setError(null);
          return;
        }
        setError('Deck not found');
        activeRef.current = null;
        setActive(null);
        setSyncStatus(null);
        return;
      }
      if (match.format !== builderFormat) {
        navigateHub(
          builderHash(
            match.format === 'cube' ? 'cube' : 'commander',
            route.userSlug,
            route.deckSlug,
          ),
        );
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
    [builderFormat, openDeck],
  );

  const refreshLibrary = useCallback(
    async (opts?: { applyRoute?: boolean }) => {
      const applyRoute = opts?.applyRoute !== false;
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
        decksRef.current = list;
        if (applyRoute) await applyRouteFromHash(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [applyRouteFromHash],
  );

  // Open known deep links before paint so BrowseShell is the first meaningful frame.
  useLayoutEffect(() => {
    const match = deepLinkIndexMatch(builderFormat);
    if (!match) {
      const route = parseBuilderRoute(window.location.hash, builderFormat);
      if (route?.userSlug === HUB_USER_SLUG) {
        const other = store.readLibraryIndex().find((d) => toKebabCase(d.name) === route.deckSlug);
        if (other && other.format !== builderFormat) {
          navigateHub(
            builderHash(
              other.format === 'cube' ? 'cube' : 'commander',
              route.userSlug,
              route.deckSlug,
            ),
          );
        }
      }
      return;
    }
    applyingRouteRef.current = true;
    void openDeck(match.deckId, { syncHash: false }).finally(() => {
      applyingRouteRef.current = false;
    });
  }, [builderFormat, openDeck]);

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
    if (activeRef.current?.deckId === next.deckId) {
      // Keep ref in sync immediately so overlapping persists/reads see latest.
      activeRef.current = next;
      setActive(next);
    }
    setApiWarning(null);
    if (isApiConfigured()) setSyncStatus('syncing');
    const { saved, apiError } = await saveDualMode(next);
    if (seq !== persistSeq.current) return;
    if (apiError) {
      setApiWarning(apiError);
      if (isApiConfigured()) setSyncStatus('error');
    } else if (isApiConfigured()) {
      setSyncStatus('synced');
    }
    if (!parseBuilderRoute(window.location.hash, builderFormat)) return;
    if (activeRef.current && activeRef.current.deckId !== saved.deckId) return;
    // Don't clobber a newer in-memory edit that landed while save was in flight.
    if (
      activeRef.current &&
      activeRef.current.deckId === saved.deckId &&
      activeRef.current.updatedAt > saved.updatedAt
    ) {
      await refreshLibrary({ applyRoute: false });
      return;
    }
    activeRef.current = saved;
    setActive(saved);
    syncDeckHash(saved);
    await refreshLibrary({ applyRoute: false });
  }

  async function removeDeck(deckId: string) {
    setApiWarning(null);
    const { apiError } = await deleteDualMode(deckId);
    if (active?.deckId === deckId) {
      setActive(null);
      setSyncStatus(null);
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
          syncStatus={syncStatus}
          onBack={() => {
            invalidatePersist();
            setActive(null);
            setSyncStatus(null);
            syncDeckHash(null);
            void refreshLibrary({ applyRoute: false });
          }}
          onChange={(next) => {
            void persist(next);
          }}
        />
      </div>
    );
  }

  const deepLinkRoute = parseBuilderRoute(window.location.hash, builderFormat);
  // Deep link still resolving — blank busy shell (no "Opening deck…" / library flash).
  if (deepLinkRoute && !error && loading) {
    return <div className="db-app" aria-busy="true" />;
  }

  return (
    <div className="db-app">
      <FormatFilteredLibrary
        builderFormat={builderFormat}
        title={title}
        addLabel={addLabel}
        decks={filteredDecks}
        loading={loading}
        error={error}
        onOpen={(id) => void openDeck(id)}
        onAdd={() => setAddOpen(true)}
        onDelete={(id) => void removeDeck(id)}
        onRefreshRemote={isApiConfigured() ? () => void refreshLibrary() : undefined}
      />
      {addOpen ? (
        <CreateDialog
          onClose={() => {
            setAddOpen(false);
            setMismatchWarning(null);
          }}
          formatMismatchWarning={mismatchWarning}
          onMismatchWarning={setMismatchWarning}
          onSave={async (doc) => {
            await persist(doc);
            await refreshLibrary({ applyRoute: false });
            const saved = await store.getDeck(doc.deckId);
            if (saved && redirectToCorrectBuilder(saved)) return;
            activeRef.current = saved;
            setActive(saved);
            if (saved) syncDeckHash(saved);
          }}
        />
      ) : null}
    </div>
  );
}
