import { useCallback, useEffect, useRef, useState } from 'react';
import { HubProgress, type HubProgressController } from '../lib/hub-progress';
import { persistReconcileDeckToHub } from './apply-hub';
import { buildAssignmentPlan, expandToCopies } from './assign';
import {
  applyCollectionPrintingReplaces,
  applyExactCollectionMarks,
  buildCollectionMarkPlan,
  copiesRemainingAfterHits,
  loadCollectionDecks,
  persistCollectionDecks,
} from './collection-mark';
import { loadHubLibrarySnapshots } from './data';
import { itemsForDeck } from './helpers';
import { parseInputToAcquired } from './input';
import { OrderReconcileAssign } from './OrderReconcileAssign';
import { OrderReconcileCollection } from './OrderReconcileCollection';
import { OrderReconcileDeckPanel } from './OrderReconcileDeck';
import { OrderReconcileInput } from './OrderReconcileInput';
import { createInitialState, resetSession, saveStateProgress, setDecision } from './progress';
import { getNextDeckId } from './reconcile';
import type {
  CollectionApplyMode,
  ItemDecision,
  OrderReconcileState,
  ReconcileItem,
} from './types';
import { ASSIGN_PHASE_ID, COLLECTION_PHASE_ID } from './types';
import './order-reconcile.css';

export function OrderReconcileApp() {
  const [state, setState] = useState<OrderReconcileState>(createInitialState);
  const [error, setError] = useState('');
  const [listText, setListText] = useState('');
  const [emailText, setEmailText] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const progressRef = useRef<HubProgressController | null>(null);
  const progressHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (progressHostRef.current && !progressRef.current) {
      progressRef.current = HubProgress.mount(progressHostRef.current);
    }
  }, []);

  const persist = useCallback((next: OrderReconcileState) => {
    saveStateProgress(next);
    setState(next);
  }, []);

  const setStatus = useCallback((msg: string) => {
    setState((prev) => ({ ...prev, statusMessage: msg }));
  }, []);

  const showProgress = useCallback((current: number, total: number, msg: string) => {
    const progress = progressRef.current;
    if (!progress) return;
    if (!progress.isActive() && !progress.isFinished()) {
      progress.start({ label: msg || 'Working…' });
    }
    progress.update({ current, total, label: msg || `Step ${current}/${total}…` });
  }, []);

  const finishProgress = useCallback((label: string, variant?: string) => {
    progressRef.current?.finish({ label, variant });
  }, []);

  function withCollectionPlan(
    base: OrderReconcileState,
    patch: Partial<OrderReconcileState> = {},
  ): OrderReconcileState {
    const next = { ...base, ...patch };
    const copies = Object.prototype.hasOwnProperty.call(patch, 'collectionCopiesRemaining')
      ? patch.collectionCopiesRemaining || []
      : next.collectionCopiesRemaining.length
        ? next.collectionCopiesRemaining
        : next.copies.length
          ? next.copies
          : expandToCopies(next.acquiredCards);
    const collectionPlan = buildCollectionMarkPlan(
      copies,
      next.collections,
      next.collectionApplyMode,
    );
    return {
      ...next,
      copies: next.copies.length ? next.copies : copies,
      collectionCopiesRemaining: copies,
      collectionPlan,
      collectionReplaceSelected: {},
    };
  }

  useEffect(() => {
    async function resume() {
      if (state.phase === 'input' || !state.acquiredCards.length) return;
      if (state.decks.length && state.decks[0].deck_snapshot) {
        if (state.phase === 'collection' && !state.collections.length) {
          try {
            setStatus('Restoring session — loading collections…');
            const collections = await loadCollectionDecks();
            persist(
              withCollectionPlan({
                ...state,
                collections,
                collectionCopiesRemaining:
                  state.collectionCopiesRemaining.length
                    ? state.collectionCopiesRemaining
                    : expandToCopies(state.acquiredCards),
              }),
            );
            setStatus('');
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }
        return;
      }
      try {
        setStatus('Restoring session — loading Hub decks…');
        const result = await loadHubLibrarySnapshots(state, {
          onProgress: showProgress,
          onStatus: setStatus,
          onFinish: finishProgress,
        });
        let next = { ...state, ...result };
        if (state.phase === 'collection') {
          const collections = await loadCollectionDecks();
          next = withCollectionPlan({
            ...next,
            collections,
            collectionCopiesRemaining:
              state.collectionCopiesRemaining.length
                ? state.collectionCopiesRemaining
                : expandToCopies(state.acquiredCards),
          });
        }
        persist(next);
        setStatus('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        persist({ ...state, phase: 'input' });
      }
    }
    void resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  async function handleContinue() {
    setError('');
    const acquiredCards = parseInputToAcquired(state.inputMode, listText, emailText);
    if (!acquiredCards.length) {
      setError('Parse at least one acquired card first.');
      return;
    }
    try {
      let next = { ...state, acquiredCards };
      const loaded = await loadHubLibrarySnapshots(next, {
        onProgress: showProgress,
        onStatus: setStatus,
        onFinish: finishProgress,
      });
      showProgress(0, 1, 'Loading collections…');
      const collections = await loadCollectionDecks();
      const copies = expandToCopies(acquiredCards);
      next = withCollectionPlan({
        ...next,
        ...loaded,
        progress: { decisions: {} },
        completedDecks: {},
        collections,
        copies,
        collectionCopiesRemaining: copies,
        collectionApplyMode: state.collectionApplyMode || 'broadcast',
        phase: 'collection',
        activeDeckId: COLLECTION_PHASE_ID,
      });
      finishProgress(
        collections.length
          ? `Loaded ${loaded.decks.length} decks · ${collections.length} binders.`
          : `Loaded ${loaded.decks.length} decks.`,
      );
      persist(next);
      setStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleContinueToDecks() {
    setError('');
    try {
      setStatus('Building deck assignment plan…');
      const plan = await buildAssignmentPlan(state);
      persist({
        ...state,
        ...plan,
        phase: 'assign',
        activeDeckId: ASSIGN_PHASE_ID,
        statusMessage: '',
      });
      scrollToTop();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleCollectionModeChange(mode: CollectionApplyMode) {
    persist(
      withCollectionPlan({
        ...state,
        collectionApplyMode: mode,
        collectionCopiesRemaining: state.collectionCopiesRemaining,
      }),
    );
  }

  function handleToggleReplace(hitId: string, selected: boolean) {
    persist({
      ...state,
      collectionReplaceSelected: {
        ...state.collectionReplaceSelected,
        [hitId]: selected,
      },
    });
  }

  async function handleMarkExact() {
    setError('');
    const hits = state.collectionPlan?.exact || [];
    if (!hits.length) return;
    try {
      showProgress(0, 1, 'Marking exact collection matches…');
      const updated = applyExactCollectionMarks(state.collections, hits);
      const dirtyIds = new Set(hits.map((h) => h.deckId));
      const toSave = updated.filter((d) => dirtyIds.has(d.deckId));
      const { saved, errors } = await persistCollectionDecks(toSave);
      const byId = new Map(saved.map((d) => [d.deckId, d]));
      const collections = updated.map((d) => byId.get(d.deckId) || d);
      const remaining = copiesRemainingAfterHits(state.collectionCopiesRemaining, hits);
      const next = withCollectionPlan({
        ...state,
        collections,
        collectionCopiesRemaining: remaining,
      });
      finishProgress(
        `Marked ${hits.length} exact match${hits.length === 1 ? '' : 'es'}.`,
        errors.length ? 'error' : 'success',
      );
      persist({
        ...next,
        statusMessage: errors.length
          ? `Marked exact matches with save warnings: ${errors.join('; ')}`
          : `Marked ${hits.length} exact collection match${hits.length === 1 ? '' : 'es'}.`,
      });
    } catch (err) {
      finishProgress(err instanceof Error ? err.message : String(err), 'error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleApplyReplaces() {
    setError('');
    const selectedKeys = new Set(
      Object.entries(state.collectionReplaceSelected)
        .filter(([, on]) => on)
        .map(([id]) => id),
    );
    if (!selectedKeys.size) return;
    const selectedHits = (state.collectionPlan?.replaceable || []).filter((hit) => {
      if (selectedKeys.has(hit.hitId)) return true;
      const rowKey = `${hit.deckId}:${hit.instanceId}`;
      return [...selectedKeys].some((id) => {
        const row = (state.collectionPlan?.replaceable || []).find((h) => h.hitId === id);
        return row && `${row.deckId}:${row.instanceId}` === rowKey;
      });
    });
    if (!selectedHits.length) return;
    try {
      showProgress(0, 1, 'Applying collection printing replacements…');
      const updated = applyCollectionPrintingReplaces(state.collections, selectedHits);
      const dirtyIds = new Set(selectedHits.map((h) => h.deckId));
      const toSave = updated.filter((d) => dirtyIds.has(d.deckId));
      const { saved, errors } = await persistCollectionDecks(toSave);
      const byId = new Map(saved.map((d) => [d.deckId, d]));
      const collections = updated.map((d) => byId.get(d.deckId) || d);
      const remaining = copiesRemainingAfterHits(state.collectionCopiesRemaining, selectedHits);
      const next = withCollectionPlan({
        ...state,
        collections,
        collectionCopiesRemaining: remaining,
      });
      finishProgress(
        `Applied ${selectedHits.length} replacement${selectedHits.length === 1 ? '' : 's'}.`,
        errors.length ? 'error' : 'success',
      );
      persist({
        ...next,
        statusMessage: errors.length
          ? `Applied replacements with save warnings: ${errors.join('; ')}`
          : `Applied ${selectedHits.length} collection replacement${selectedHits.length === 1 ? '' : 's'}.`,
      });
    } catch (err) {
      finishProgress(err instanceof Error ? err.message : String(err), 'error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDeckSelect(deckId: string) {
    persist({ ...state, activeDeckId: deckId });
    scrollToTop();
  }

  function handleDecision(itemId: string, decision: ItemDecision) {
    persist(setDecision(state, itemId, decision));
  }

  function handleItemChange(itemId: string, patch: Partial<ReconcileItem>) {
    persist({
      ...state,
      reconcileItems: state.reconcileItems.map((item) => (item.item_id === itemId ? { ...item, ...patch } : item)),
    });
  }

  async function handleCompleteDeck() {
    setError('');
    const deckId = state.activeDeckId;
    if (!deckId) return;
    const items = itemsForDeck(deckId, state.reconcileItems) as ReconcileItem[];
    try {
      await persistReconcileDeckToHub(
        deckId,
        items,
        (itemId) => state.progress.decisions[itemId] || null,
        state.isProxyOrder,
      );
      const completedDecks = { ...state.completedDecks, [deckId]: true };
      const { phase, activeDeckId } = getNextDeckId({ ...state, completedDecks });
      persist({ ...state, completedDecks, phase, activeDeckId, statusMessage: 'Saved to Hub.' });
      scrollToTop();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function hasProgressDecisions() {
    return Object.keys(state.progress.decisions || {}).length > 0;
  }

  function handleNewSession() {
    if (
      hasProgressDecisions() &&
      !window.confirm('Start a new session? Current decisions will be cleared.')
    ) {
      return;
    }
    persist(resetSession(state));
  }

  function handleEditAcquired() {
    if (
      hasProgressDecisions() &&
      !window.confirm('Return to edit acquired cards? You can Continue again after editing.')
    ) {
      return;
    }
    persist({ ...state, phase: 'input' });
  }

  function renderDeckNav() {
    if (state.phase === 'collection') {
      return (
        <button
          type="button"
          className={'hub-deck-chip' + (state.activeDeckId === COLLECTION_PHASE_ID ? ' active' : '')}
          onClick={() => handleDeckSelect(COLLECTION_PHASE_ID)}
        >
          Collection
          <span className="hub-deck-chip-count">
            {(state.collectionPlan?.exactBumpCount || 0) + (state.collectionPlan?.replaceableRowCount || 0)}
          </span>
        </button>
      );
    }
    if (state.phase === 'assign') {
      return (
        <button
          type="button"
          className={'hub-deck-chip' + (state.activeDeckId === ASSIGN_PHASE_ID ? ' active' : '')}
          onClick={() => handleDeckSelect(ASSIGN_PHASE_ID)}
        >
          Disambiguate
          <span className="hub-deck-chip-count">{state.needsReview.length}</span>
        </button>
      );
    }
    if (state.phase === 'reconcile') {
      return (
        <>
          {state.decks.map((deck) => {
            const count = itemsForDeck(deck.deck_id, state.reconcileItems).length;
            if (!count) return null;
            const done = state.completedDecks[deck.deck_id] ? ' done' : '';
            return (
              <button
                key={deck.deck_id}
                type="button"
                className={'hub-deck-chip' + (state.activeDeckId === deck.deck_id ? ' active' : '') + done}
                onClick={() => handleDeckSelect(deck.deck_id)}
              >
                {deck.deck_name}
                <span className="hub-deck-chip-count">{count}</span>
              </button>
            );
          })}
        </>
      );
    }
    return null;
  }

  function renderMain() {
    if (state.phase === 'input') {
      return (
        <OrderReconcileInput
          state={state}
          listText={listText}
          emailText={emailText}
          onListTextChange={setListText}
          onEmailTextChange={setEmailText}
          onInputModeChange={(mode) => setState((prev) => ({ ...prev, inputMode: mode }))}
          onProxyOrderChange={(checked) => persist({ ...state, isProxyOrder: checked })}
          onAcquiredCardsChange={(acquiredCards) => persist({ ...state, acquiredCards })}
          onParse={() => {}}
          onContinue={() => void handleContinue()}
        />
      );
    }
    if (state.phase === 'collection') {
      return (
        <OrderReconcileCollection
          state={state}
          onApplyModeChange={handleCollectionModeChange}
          onToggleReplace={handleToggleReplace}
          onMarkExact={() => void handleMarkExact()}
          onApplyReplaces={() => void handleApplyReplaces()}
          onContinueToDecks={() => void handleContinueToDecks()}
        />
      );
    }
    if (state.phase === 'assign') {
      return (
        <OrderReconcileAssign
          state={state}
          onNeedsReviewChange={(needsReview) => persist({ ...state, needsReview })}
          onAcquiredCardsChange={(acquiredCards) => persist({ ...state, acquiredCards })}
          onRebuildPlan={(patch) => persist({ ...state, ...patch })}
          onStatus={setStatus}
          onStartReconcile={(reconcileItems, activeDeckId) =>
            persist({ ...state, reconcileItems, phase: 'reconcile', activeDeckId })
          }
        />
      );
    }
    const deck = state.decks.find((d) => d.deck_id === state.activeDeckId);
    const items = itemsForDeck(state.activeDeckId || '', state.reconcileItems);
    if (!deck || !items.length) {
      return <div className="or-empty">No cards for this deck.</div>;
    }
    return (
      <OrderReconcileDeckPanel
        state={state}
        deck={deck}
        items={items}
        onDecision={handleDecision}
        onItemChange={handleItemChange}
        onCompleteDeck={() => void handleCompleteDeck()}
        onStatus={setStatus}
      />
    );
  }

  return (
    <div className="order-reconcile-app">
      <button
        type="button"
        id="or-right-nav-toggle"
        className="or-right-nav-toggle"
        aria-label="Decks"
        aria-expanded={navOpen}
        onClick={() => setNavOpen((o) => !o)}
      >
        Decks
      </button>
      <div
        id="or-right-nav-backdrop"
        className={'or-right-nav-backdrop' + (navOpen ? ' open' : '')}
        onClick={() => setNavOpen(false)}
      />
      <div className="or-layout">
        <div className="or-main-area">
          <div className="hub-sticky-chrome">
            <header className="or-header">
              <h2>Order Reconcile</h2>
              <div className="or-meta">Match acquired cards to swap queues and Seeking, then save to Hub.</div>
            </header>
            <div className="hub-progress-host" ref={progressHostRef} id="or-progress-host" />
          </div>
          {error || state.statusMessage ? (
            <p
              className={error ? 'or-error or-status-slot' : 'hub-muted or-status-slot'}
              id={error ? 'or-error' : undefined}
              role={error ? 'alert' : 'status'}
            >
              {error || state.statusMessage}
            </p>
          ) : null}
          <div className="or-body">
            <div id="or-content">
              <div id="or-main-content">{renderMain()}</div>
            </div>
          </div>
        </div>
        <aside id="or-right-nav" className={'or-right-nav' + (navOpen ? ' open' : '')}>
          <div className="or-nav-actions">
            <h3>Session</h3>
            <button
              type="button"
              className="or-btn or-btn-ghost"
              id="or-new-session"
              onClick={handleNewSession}
            >
              New session
            </button>
            <button
              type="button"
              className="or-btn or-btn-ghost"
              id="or-back-input"
              onClick={handleEditAcquired}
            >
              Edit acquired cards
            </button>
          </div>
          <div>
            <h3>Decks</h3>
            <div className="hub-deck-list" id="or-deck-list">
              {renderDeckNav()}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
