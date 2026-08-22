import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { DeckDocument, DeckOwnership, DeckSummary, DeckVisibility } from '@rayenz-hub/shared';
import { filterLibraryByFormat, libraryDeckCapMessage, MAX_LIBRARY_DECKS } from '@rayenz-hub/shared';
import { isApiConfigured } from '../../api/hub-api';
import {
  builderHash,
  builderBasePath,
  hubUserSlug,
  isLocalLibrarySlug,
  normalizeHash,
  parseBuilderRoute,
  rewriteRetiredUserSlug,
  SANDBOX_USER_SLUG,
  type BuilderFormat,
} from '../../hub/routes';
import {
  HUB_AUTH_CHANGED_EVENT,
  HUB_AUTH_REQUIRED_EVENT,
  getHubAuthSession,
} from '../../lib/hub-auth-session';
import { navigateHub } from '../../lib/hub-storage';
import { toKebabCase } from '../../lib/string-utils';
import { BrowseShell } from '../browse/BrowseShell';
import { FormatFilteredLibrary } from './library/FormatFilteredLibrary';
import * as store from '../store/deck-store';
import * as deckApi from '../store/deck-api';
import { deleteDualMode, saveDualMode } from '../store/deck-dual-mode';
import { getLocalLibraryScope, peekLocalLibraryScope } from '../store/local-library-scope';
import {
  listFallbackLibrary,
  pullRemoteLibraryUpdates,
  resolveLibraryDocument,
} from '../store/library-sync';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';
import {
  SAMPLE_COMMANDER_DECK_NAME,
  ensureSampleDeck,
  getSampleCommanderSummary,
  isSampleDeckId,
  isSampleDismissed,
  shouldOfferSampleCommander,
} from '../sample/sample-deck';
import { duplicateDeckDocument } from '../import-export/import-deck';

export type CreateDialogProps = {
  onClose: () => void;
  onSave: (doc: DeckDocument) => Promise<void>;
  formatMismatchWarning?: string | null;
  onMismatchWarning?: (message: string | null) => void;
};

function otherBuilderFormat(format: BuilderFormat): BuilderFormat {
  return format === 'commander' ? 'cube' : 'commander';
}

function hashUsesOtherBuilder(hash: string, builderFormat: BuilderFormat): boolean {
  const normalized = normalizeHash(hash).slice(1);
  const otherBase = builderBasePath(otherBuilderFormat(builderFormat));
  return normalized === otherBase || normalized.startsWith(`${otherBase}/`);
}

function indexMatchesRouteScope(deckId: string, userSlug: string): boolean {
  if (isSampleDeckId(deckId)) return userSlug === SANDBOX_USER_SLUG;
  const scope = getLocalLibraryScope(deckId);
  if (userSlug === SANDBOX_USER_SLUG) return scope === 'sandbox';
  return scope === 'account';
}

/** Sync index hit for the current builder deep-link hash, if any. */
function deepLinkIndexMatch(builderFormat: BuilderFormat): DeckSummary | null {
  const route = parseBuilderRoute(window.location.hash, builderFormat);
  if (!route || !isLocalLibrarySlug(route.userSlug)) return null;
  const match = store.readLibraryIndex().find(
    (d) => toKebabCase(d.name) === route.deckSlug && indexMatchesRouteScope(d.deckId, route.userSlug),
  );
  if (match && match.format === builderFormat) {
    if (isSampleDeckId(match.deckId) && isSampleDismissed()) return null;
    return match;
  }
  // Sample may not be seeded into the index yet on first paint.
  if (
    builderFormat === 'commander' &&
    route.deckSlug === toKebabCase(SAMPLE_COMMANDER_DECK_NAME) &&
    !isSampleDismissed()
  ) {
    return getSampleCommanderSummary();
  }
  return null;
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
  const [sampleDeck, setSampleDeck] = useState<DeckSummary | null>(null);
  const [active, setActive] = useState<DeckDocument | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<DeckSyncStatus | null>(null);
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
  const persistSeq = useRef(0);
  const openSeq = useRef(0);
  const routeSeq = useRef(0);
  const decksRef = useRef<DeckSummary[]>([]);
  const activeRef = useRef<DeckDocument | null>(null);
  const applyingRouteRef = useRef(false);
  const readOnlyRef = useRef(false);
  const [readOnly, setReadOnly] = useState(false);

  const filteredDecks = useMemo(
    () => filterLibraryByFormat(decks, builderFormat).filter((d) => !isSampleDeckId(d.deckId)),
    [decks, builderFormat],
  );

  useEffect(() => {
    decksRef.current = decks;
  }, [decks]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const syncDeckHash = useCallback(
    (doc: DeckDocument | null) => {
      const route = parseBuilderRoute(window.location.hash, builderFormat);
      const userSlug =
        route?.userSlug === SANDBOX_USER_SLUG ? SANDBOX_USER_SLUG : hubUserSlug();
      const next = doc
        ? builderHash(builderFormat, userSlug, toKebabCase(doc.name))
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
    navigateHub(builderHash(targetFormat, hubUserSlug(), toKebabCase(doc.name)));
    return true;
  }, [builderFormat]);

  const openDeck = useCallback(
    async (deckId: string, opts?: { syncHash?: boolean }) => {
      setError(null);
      const route = parseBuilderRoute(window.location.hash, builderFormat);
      const sandboxOpen =
        !getHubAuthSession() || route?.userSlug === SANDBOX_USER_SLUG || isSampleDeckId(deckId);

      let doc = sandboxOpen
        ? await store.getDeck(deckId)
        : await resolveLibraryDocument(deckId);
      if (!doc && isSampleDeckId(deckId) && !isSampleDismissed()) {
        doc = await ensureSampleDeck();
      }
      if (!doc) {
        setError(sandboxOpen ? 'Deck not found in local store' : 'Deck not found');
        return;
      }
      if (redirectToCorrectBuilder(doc)) return;

      setReadOnly(false);
      readOnlyRef.current = false;
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

      if (isSampleDeckId(deckId) || sandboxOpen) {
        setSyncStatus(isSampleDeckId(deckId) && isApiConfigured() ? 'local' : null);
        return;
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
    [builderFormat, redirectToCorrectBuilder, syncDeckHash],
  );

  function invalidatePersist() {
    persistSeq.current += 1;
  }

  const applyRouteFromHash = useCallback(
    async (list: DeckSummary[]) => {
      const gen = ++routeSeq.current;
      const stillCurrent = () => gen === routeSeq.current;
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
          setReadOnly(false);
          readOnlyRef.current = false;
        }
        return;
      }
      if (rewriteRetiredUserSlug(route.userSlug) !== route.userSlug) {
        navigateHub(builderHash(builderFormat, rewriteRetiredUserSlug(route.userSlug), route.deckSlug));
        return;
      }
      if (!isLocalLibrarySlug(route.userSlug)) {
        applyingRouteRef.current = true;
        try {
          const doc = await deckApi.apiGetPublicDeck(route.userSlug, route.deckSlug);
          if (!stillCurrent()) return;
          if (!doc) {
            setError('Deck not found');
            activeRef.current = null;
            setActive(null);
            setSyncStatus(null);
            setReadOnly(false);
            readOnlyRef.current = false;
            return;
          }
          const targetFormat: BuilderFormat = doc.format === 'cube' ? 'cube' : 'commander';
          if (targetFormat !== builderFormat) {
            navigateHub(builderHash(targetFormat, route.userSlug, route.deckSlug));
            return;
          }
          setError(null);
          setReadOnly(true);
          readOnlyRef.current = true;
          setActive(doc);
          activeRef.current = doc;
          setSyncStatus(null);
        } catch (e) {
          if (!stillCurrent()) return;
          setError(e instanceof Error && e.message ? e.message : 'Deck not found');
          activeRef.current = null;
          setActive(null);
          setSyncStatus(null);
          setReadOnly(false);
          readOnlyRef.current = false;
        } finally {
          if (stillCurrent()) applyingRouteRef.current = false;
        }
        return;
      }
      // Drop a stale public-fetch lock so hash changes are not ignored after login.
      applyingRouteRef.current = false;
      const matchList =
        route.userSlug === SANDBOX_USER_SLUG
          ? store.readLibraryIndex().filter((d) => indexMatchesRouteScope(d.deckId, SANDBOX_USER_SLUG))
          : list;
      const match = matchList.find((d) => toKebabCase(d.name) === route.deckSlug);
      if (!match) {
        if (activeRef.current && toKebabCase(activeRef.current.name) === route.deckSlug) {
          if (readOnlyRef.current) {
            applyingRouteRef.current = true;
            try {
              await openDeck(activeRef.current.deckId, { syncHash: false });
            } finally {
              if (stillCurrent()) applyingRouteRef.current = false;
            }
            return;
          }
          setError(null);
          return;
        }
        setError('Deck not found');
        activeRef.current = null;
        setActive(null);
        setSyncStatus(null);
        setReadOnly(false);
        readOnlyRef.current = false;
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
      if (activeRef.current?.deckId === match.deckId && !readOnlyRef.current) {
        setError(null);
        return;
      }
      applyingRouteRef.current = true;
      try {
        await openDeck(match.deckId, { syncHash: false });
      } finally {
        if (stillCurrent()) applyingRouteRef.current = false;
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
        let list: DeckSummary[];
        try {
          list = await pullRemoteLibraryUpdates();
        } catch (e) {
          setApiWarning(e instanceof Error ? e.message : String(e));
          list = await listFallbackLibrary();
        }

        const realList = list.filter((d) => !isSampleDeckId(d.deckId));
        let offeredSample: DeckSummary | null = null;
        if (builderFormat === 'commander') {
          const realCommander = filterLibraryByFormat(realList, 'commander');
          if (shouldOfferSampleCommander(realCommander)) {
            const ensured = await ensureSampleDeck();
            offeredSample = ensured
              ? { ...getSampleCommanderSummary(), updatedAt: ensured.updatedAt }
              : getSampleCommanderSummary();
          }
        }
        setSampleDeck(offeredSample);
        setDecks(realList);
        const routeList = offeredSample ? [...realList, offeredSample] : realList;
        decksRef.current = routeList;
        if (applyRoute) await applyRouteFromHash(routeList);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [applyRouteFromHash, builderFormat],
  );

  // Open known deep links before paint so BrowseShell is the first meaningful frame.
  useLayoutEffect(() => {
    const match = deepLinkIndexMatch(builderFormat);
    if (!match) {
      const route = parseBuilderRoute(window.location.hash, builderFormat);
      if (route && rewriteRetiredUserSlug(route.userSlug) !== route.userSlug) {
        navigateHub(builderHash(builderFormat, rewriteRetiredUserSlug(route.userSlug), route.deckSlug));
        return;
      }
      if (route && isLocalLibrarySlug(route.userSlug)) {
        const other = store.readLibraryIndex().find(
          (d) =>
            toKebabCase(d.name) === route.deckSlug &&
            indexMatchesRouteScope(d.deckId, route.userSlug),
        );
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
    function onAuthChanged() {
      void refreshLibrary();
    }
    window.addEventListener(HUB_AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthChanged);
    return () => {
      window.removeEventListener(HUB_AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthChanged);
    };
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
    if (readOnlyRef.current) return;
    const seq = ++persistSeq.current;
    if (activeRef.current?.deckId === next.deckId) {
      // Keep ref in sync immediately so overlapping persists/reads see latest.
      activeRef.current = next;
      setActive(next);
    }
    setApiWarning(null);
    const sample = isSampleDeckId(next.deckId);
    if (
      isApiConfigured() &&
      !sample &&
      getHubAuthSession() &&
      peekLocalLibraryScope(next.deckId) !== 'sandbox'
    ) {
      setSyncStatus('syncing');
    }
    const { saved, apiError, uploaded } = await saveDualMode(next);
    if (seq !== persistSeq.current) return;
    if (sample || (!uploaded && !apiError)) {
      setSyncStatus(isApiConfigured() && (sample || Boolean(getHubAuthSession())) ? 'local' : null);
    } else if (apiError) {
      setApiWarning(apiError);
      if (isApiConfigured()) setSyncStatus('error');
    } else if (uploaded) {
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

  async function setDeckOwnership(deckId: string, ownership: DeckOwnership) {
    setApiWarning(null);
    const doc = await resolveLibraryDocument(deckId);
    if (!doc) return;
    const current = doc.ownership === 'theory' ? 'theory' : 'owned';
    if (current === ownership) return;
    // Save without going through persist()'s "must have open-deck route" gate —
    // library ownership changes happen with no deck slug in the hash.
    const sample = isSampleDeckId(doc.deckId);
    const { saved, apiError, uploaded } = await saveDualMode({ ...doc, ownership });
    if (apiError) {
      setApiWarning(apiError);
      if (isApiConfigured()) setSyncStatus('error');
    } else if (uploaded) {
      setSyncStatus('synced');
    } else if (isApiConfigured() && !sample && getHubAuthSession()) {
      setSyncStatus('local');
    }
    if (activeRef.current?.deckId === saved.deckId) {
      activeRef.current = saved;
      setActive(saved);
    }
    await refreshLibrary({ applyRoute: false });
  }

  async function setDeckVisibility(deckId: string, visibility: DeckVisibility) {
    setApiWarning(null);
    const doc = await resolveLibraryDocument(deckId);
    if (!doc) return;
    const current = doc.visibility === 'private' ? 'private' : 'public';
    if (current === visibility) return;
    const sample = isSampleDeckId(doc.deckId);
    const { saved, apiError, uploaded } = await saveDualMode({ ...doc, visibility });
    if (apiError) {
      setApiWarning(apiError);
      if (isApiConfigured()) setSyncStatus('error');
    } else if (uploaded) {
      setSyncStatus('synced');
    } else if (isApiConfigured() && !sample && getHubAuthSession()) {
      setSyncStatus('local');
    }
    if (activeRef.current?.deckId === saved.deckId) {
      activeRef.current = saved;
      setActive(saved);
    }
    await refreshLibrary({ applyRoute: false });
  }

  async function duplicateDeck(source: DeckDocument | string) {
    const realCount = decksRef.current.filter((d) => !isSampleDeckId(d.deckId)).length;
    if (realCount >= MAX_LIBRARY_DECKS) {
      setError(libraryDeckCapMessage());
      return;
    }
    setApiWarning(null);
    const doc = typeof source === 'string' ? await resolveLibraryDocument(source) : source;
    if (!doc) {
      setError('Deck not found');
      return;
    }
    const existingNames = decksRef.current
      .filter((d) => d.format === doc.format)
      .map((d) => d.name);
    const copy = duplicateDeckDocument(doc, existingNames);
    const { saved, apiError, uploaded } = await saveDualMode(copy);
    if (apiError) {
      setApiWarning(apiError);
      if (isApiConfigured()) setSyncStatus('error');
    } else if (uploaded) {
      setSyncStatus('synced');
    } else if (isApiConfigured() && getHubAuthSession()) {
      setSyncStatus('local');
    }
    if (redirectToCorrectBuilder(saved)) return;
    setReadOnly(false);
    readOnlyRef.current = false;
    activeRef.current = saved;
    setActive(saved);
    syncDeckHash(saved);
    await refreshLibrary({ applyRoute: false });
  }

  if (active) {
    return (
      <div className="db-app">
        {apiWarning ? <p className="hub-warn">{apiWarning}</p> : null}
        <BrowseShell
          deck={active}
          syncStatus={syncStatus}
          readOnly={readOnly}
          onDuplicate={(doc) => void duplicateDeck(doc)}
          duplicateDisabled={decks.length >= MAX_LIBRARY_DECKS}
          onBack={() => {
            invalidatePersist();
            setActive(null);
            setSyncStatus(null);
            setReadOnly(false);
            readOnlyRef.current = false;
            syncDeckHash(null);
            void refreshLibrary({ applyRoute: false });
          }}
          onChange={(next) => {
            if (readOnlyRef.current) return;
            void persist(next);
          }}
        />
      </div>
    );
  }

  const deepLinkRoute = parseBuilderRoute(window.location.hash, builderFormat);
  // Deep link still resolving — show minimal chrome (avoid library skeleton flash).
  if (deepLinkRoute && !error && loading) {
    return (
      <div className="db-app db-deep-link-loading" aria-busy="true">
        <p className="hub-muted" role="status">
          Opening deck…
        </p>
      </div>
    );
  }

  const atDeckCap = decks.length >= MAX_LIBRARY_DECKS;

  return (
    <div className="db-app">
      <FormatFilteredLibrary
        builderFormat={builderFormat}
        title={title}
        addLabel={addLabel}
        decks={filteredDecks}
        sampleDeck={builderFormat === 'commander' ? sampleDeck : null}
        loading={loading}
        error={error}
        atDeckCap={atDeckCap}
        capMessage={libraryDeckCapMessage()}
        onOpen={(id) => void openDeck(id)}
        onAdd={() => {
          if (atDeckCap) return;
          setAddOpen(true);
        }}
        onDelete={(id) => void removeDeck(id)}
        onDuplicate={(id) => void duplicateDeck(id)}
        onSetOwnership={(id, ownership) => void setDeckOwnership(id, ownership)}
        onSetVisibility={(id, visibility) => void setDeckVisibility(id, visibility)}
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
            const saved =
              activeRef.current?.deckId === doc.deckId
                ? activeRef.current
                : await resolveLibraryDocument(doc.deckId);
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
