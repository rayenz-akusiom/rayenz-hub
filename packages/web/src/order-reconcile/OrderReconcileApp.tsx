import { useCallback, useEffect, useRef, useState } from 'react';
import { HubProgress, type HubProgressController } from '../lib/hub-progress';
import { buildAssignmentPlan } from './assign';
import { fetchAllSnapshots } from './data';
import { itemsForDeck } from './helpers';
import { parseInputToAcquired } from './input';
import { OrderReconcileAssign } from './OrderReconcileAssign';
import { OrderReconcileDeckPanel } from './OrderReconcileDeck';
import { OrderReconcileInput } from './OrderReconcileInput';
import { OrderReconcileStaging } from './OrderReconcileStaging';
import { createInitialState, resetSession, saveStateProgress, setDecision } from './progress';
import { getNextDeckId } from './reconcile';
import type { ItemDecision, OrderReconcileState, ReconcileItem } from './types';
import { ASSIGN_PHASE_ID, STAGING_DECK_ID } from './types';
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

  useEffect(() => {
    async function resume() {
      if (state.phase === 'input' || !state.acquiredCards.length) return;
      if (state.decks.length && state.decks[0].deck_snapshot) return;
      try {
        setStatus('Restoring session — refetching decks…');
        const result = await fetchAllSnapshots(state, {
          onProgress: showProgress,
          onStatus: setStatus,
          onFinish: finishProgress,
        });
        persist({ ...state, ...result });
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
      const fetched = await fetchAllSnapshots(next, {
        onProgress: showProgress,
        onStatus: setStatus,
        onFinish: finishProgress,
      });
      next = {
        ...next,
        ...fetched,
        progress: { decisions: {} },
        completedDecks: {},
      };
      const plan = await buildAssignmentPlan(next);
      next = {
        ...next,
        ...plan,
        phase: 'assign',
        activeDeckId: ASSIGN_PHASE_ID,
      };
      persist(next);
    } catch (err) {
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

  function handleCompleteDeck() {
    const completedDecks = { ...state.completedDecks, [state.activeDeckId!]: true };
    const { phase, activeDeckId } = getNextDeckId({ ...state, completedDecks });
    persist({ ...state, completedDecks, phase, activeDeckId });
    scrollToTop();
  }

  function renderDeckNav() {
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
    if (state.phase === 'reconcile' || state.phase === 'staging') {
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
          <button
            type="button"
            className={'hub-deck-chip' + (state.activeDeckId === STAGING_DECK_ID ? ' active' : '')}
            onClick={() => handleDeckSelect(STAGING_DECK_ID)}
          >
            Buy/trade list
          </button>
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
    if (state.activeDeckId === STAGING_DECK_ID) {
      return <OrderReconcileStaging state={state} onStatus={setStatus} />;
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
        onCompleteDeck={handleCompleteDeck}
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
        aria-label="Open menu"
        onClick={() => setNavOpen((o) => !o)}
      >
        &#9776;
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
              <div className="or-meta">Match acquired cards to swap queues and update Archidekt decks.</div>
              {state.statusMessage ? <div className="or-meta">{state.statusMessage}</div> : null}
            </header>
            <div className="hub-progress-host" ref={progressHostRef} id="or-progress-host" />
          </div>
          {error ? (
            <div className="or-error" id="or-error">
              {error}
            </div>
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
              onClick={() => persist(resetSession(state))}
            >
              New session
            </button>
            <button
              type="button"
              className="or-btn or-btn-ghost"
              id="or-back-input"
              onClick={() => persist({ ...state, phase: 'input' })}
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
