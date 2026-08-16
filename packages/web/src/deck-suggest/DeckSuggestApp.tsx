import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { HubProgress, type HubProgressController } from '../lib/hub-progress';
import { loadDeckSuggestSettings, saveDeckSuggestSettings } from '../lib/hub-storage';
import { CardSizePicker } from '../cards/CardSizePicker';
import { useCardSize } from '../cards/card-size';
import { DeckSuggestResults } from './DeckSuggestResults';
import { DeckSuggestSetup } from './DeckSuggestSetup';
import { loadHubLibraryDecks } from './data';
import { applyDeckList } from './deck-load';
import { buildSummary, downloadJson, hasReviewableSuggestions } from './export';
import { generateSuggestions, transferToDeckReview } from './generation';
import { getGenerateReadiness, rulesDebugEnabled } from './readiness';
import { AcceptDialogue } from './AcceptDialogue';
import {
  buildSeekingAcceptPatch,
  buildSwapAcceptPatch,
  persistSuggestPatch,
  type SessionAccept,
} from './accept';
import { buildSessionWishlistText } from './wishlist-export';
import { proposePageIds, remainingIds } from './paging';
import { getDeck } from '../deck-builder/store/deck-store';
import { apiGetDeck } from '../deck-builder/store/deck-api';
import { isApiConfigured } from '../api/hub-api';
import type { DeckDocument } from '@rayenz-hub/shared';
import type {
  DeckSelection,
  DeckSuggestSettings,
  DeckSuggestState,
  SetInputMode,
  Suggestion,
} from './types';
import './deck-suggest.css';

function createInitialState(): DeckSuggestState {
  const settings = loadDeckSuggestSettings() as DeckSuggestSettings;
  const mode: SetInputMode = settings.setInputMode === 'codes' ? 'codes' : 'release';
  return {
    setScope: null,
    deckSelection: { folderUrl: '', decks: [], selectedIds: [] },
    profilesConnected: false,
    generationRun: null,
    ui: {
      setCodesInput: settings.setCodes || '',
      releaseId: settings.releaseId || '',
      setInputMode: mode,
    },
    settings,
    statusMessage: '',
    generating: false,
  };
}

export function DeckSuggestApp() {
  const [state, setState] = useState<DeckSuggestState>(createInitialState);
  const [error, setError] = useState('');
  const [decksLoading, setDecksLoading] = useState(true);
  const [sessionAccepts, setSessionAccepts] = useState<SessionAccept[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [processedIds, setProcessedIds] = useState<string[]>([]);
  const [accepting, setAccepting] = useState<{ deckId: string; suggestion: Suggestion } | null>(
    null,
  );
  const [acceptDeck, setAcceptDeck] = useState<DeckDocument | null>(null);
  const progressRef = useRef<HubProgressController | null>(null);
  const progressHostRef = useRef<HTMLDivElement>(null);
  const { size: cardSize, widthPx: cardWidthPx, setSize: setCardSize } = useCardSize();

  useEffect(() => {
    if (progressHostRef.current && !progressRef.current) {
      progressRef.current = HubProgress.mount(progressHostRef.current);
    }
  }, []);

  useEffect(() => {
    const settings = loadDeckSuggestSettings() as DeckSuggestSettings;
    const mode: SetInputMode = settings.setInputMode === 'codes' ? 'codes' : 'release';
    setState((prev) => ({
      ...prev,
      settings,
      ui: {
        setCodesInput: settings.setCodes || '',
        releaseId: settings.releaseId || '',
        setInputMode: mode,
      },
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDecksLoading(true);
      try {
        const loaded = await loadHubLibraryDecks();
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          deckSelection: applyDeckList(loaded, prev.deckSelection),
        }));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setDecksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const readiness = useMemo(() => getGenerateReadiness(state), [state]);
  const blockedReason = readiness.ok
    ? ''
    : readiness.items.find((item) => !item.ok)?.label || 'Complete setup first';
  const showPostGenerate = !!state.generationRun;

  const visibleRun = useMemo(() => {
    if (!state.generationRun) return null;
    const dismissed = new Set(dismissedIds);
    return {
      ...state.generationRun,
      deckResults: state.generationRun.deckResults.map((r) => ({
        ...r,
        suggestions: (r.suggestions || []).filter((s) => !dismissed.has(s.suggestion_id)),
      })),
    };
  }, [state.generationRun, dismissedIds]);

  const canReview = !!visibleRun && hasReviewableSuggestions({ ...state, generationRun: visibleRun });
  const summary = visibleRun ? buildSummary({ ...state, generationRun: visibleRun }) : null;
  const debugEnabled = rulesDebugEnabled(state.settings);
  const resolvedSetCodes = visibleRun?.setCodes || [];

  const persistSettings = useCallback((settings: DeckSuggestSettings) => {
    saveDeckSuggestSettings(settings);
    setState((prev) => ({ ...prev, settings }));
  }, []);

  const remaining = remainingIds(
    state.deckSelection.decks.map((d) => d.deck_id),
    processedIds,
  );
  const wishlistText = buildSessionWishlistText(sessionAccepts);

  async function openAccept(deckId: string, suggestion: Suggestion) {
    const doc = (await getDeck(deckId)) || (await apiGetDeck(deckId));
    setAcceptDeck(doc);
    setAccepting({ deckId, suggestion });
  }

  async function saveSwap(outInstanceId: string) {
    if (!accepting || !acceptDeck) return;
    try {
      const patch = buildSwapAcceptPatch(acceptDeck, accepting.suggestion, outInstanceId);
      await persistSuggestPatch(accepting.deckId, patch);
      setSessionAccepts((prev) => [
        ...prev,
        {
          deckId: accepting.deckId,
          cardName: accepting.suggestion.card.name,
          quantity: 1,
          printing: {
            set_code: accepting.suggestion.card.set_code,
            collector_number: accepting.suggestion.card.collector_number,
          },
          kind: 'queued_in',
        },
      ]);
      setDismissedIds((prev) => [...prev, accepting.suggestion.suggestion_id]);
      setAccepting(null);
      setAcceptDeck(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveSeeking() {
    if (!accepting || !acceptDeck) return;
    try {
      const patch = buildSeekingAcceptPatch(acceptDeck, accepting.suggestion);
      await persistSuggestPatch(accepting.deckId, patch);
      setSessionAccepts((prev) => [
        ...prev,
        {
          deckId: accepting.deckId,
          cardName: accepting.suggestion.card.name,
          quantity: 1,
          printing: {
            set_code: accepting.suggestion.card.set_code,
            collector_number: accepting.suggestion.card.collector_number,
          },
          kind: 'seeking',
        },
      ]);
      setDismissedIds((prev) => [...prev, accepting.suggestion.suggestion_id]);
      setAccepting(null);
      setAcceptDeck(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleNextPage() {
    const cap = state.generationRun?.cap || 20;
    const nextIds = proposePageIds(
      state.deckSelection.decks.map((d) => d.deck_id),
      processedIds,
      cap,
    );
    setState((prev) => ({
      ...prev,
      generationRun: null,
      deckSelection: { ...prev.deckSelection, selectedIds: nextIds },
    }));
  }

  async function handleGenerate() {
    if (!readiness.ok) return;
    setError('');
    setState((prev) => ({ ...prev, generating: true }));
    progressRef.current?.start({ label: 'Generating…' });
    try {
      const nextSettings = {
        ...state.settings,
        setCodes: state.ui.setCodesInput,
        releaseId: state.ui.releaseId,
        setInputMode: state.ui.setInputMode,
      };
      persistSettings(nextSettings);
      const run = await generateSuggestions(
        { ...state, settings: nextSettings },
        (update) => progressRef.current?.update(update),
        state.generationRun?.cap || 20,
      );
      setProcessedIds((prev) => [...new Set([...prev, ...state.deckSelection.selectedIds])]);
      setState((prev) => ({
        ...prev,
        generationRun: run,
        generating: false,
        setScope: run.setCodes?.length
          ? {
              codes: run.setCodes,
              codesKey: run.setCodesKey,
              cards: [],
              complete: true,
            }
          : prev.setScope,
      }));
      progressRef.current?.finish({
        label: 'Generated suggestions for ' + run.deckResults.length + ' deck(s).',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setState((prev) => ({ ...prev, generating: false }));
      progressRef.current?.finish({ label: msg, variant: 'error' });
    }
  }

  async function handleReviewHandoff() {
    if (!canReview) return;
    try {
      await transferToDeckReview(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDownload() {
    if (!state.generationRun) return;
    try {
      downloadJson(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const shellStyle = {
    ['--db-card-w']: `${cardWidthPx}px`,
  } as CSSProperties;

  return (
    <div className="deck-suggest-app" style={shellStyle}>
      <div className="hub-sticky-chrome">
        <header className="ds-header">
          <div className="ds-header-top">
            <div className="ds-header-copy">
              <h2>Deck Suggest</h2>
              <p className="ds-meta">
                Suggest upgrades for your Commander decks from a set release.
              </p>
            </div>
            <div className="ds-action-bar">
              <CardSizePicker size={cardSize} onChange={setCardSize} />
              <button
                type="button"
                className="ds-btn ds-btn-primary"
                id="ds-generate"
                disabled={!readiness.ok || state.generating}
                title={!readiness.ok ? blockedReason : ''}
                onClick={() => void handleGenerate()}
              >
                Generate
              </button>
              {showPostGenerate ? (
                <>
                  <button
                    type="button"
                    className="ds-btn ds-btn-primary"
                    id="ds-review-handoff"
                    disabled={!canReview}
                    title={
                      canReview ? '' : 'Generate suggestions with at least one match first'
                    }
                    onClick={() => void handleReviewHandoff()}
                  >
                    Review in Deck Review
                  </button>
                  <button
                    type="button"
                    className="ds-btn"
                    id="ds-download"
                    onClick={handleDownload}
                  >
                    Download JSON
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {!readiness.ok ? (
            <p className="ds-meta ds-blocked-reason" id="ds-blocked-reason">
              {blockedReason}
            </p>
          ) : null}
        </header>
        <div className="hub-progress-host" id="ds-progress-host" ref={progressHostRef} />
      </div>

      {error ? (
        <div className="ds-error" id="ds-error">
          {error}
        </div>
      ) : null}

      <div className="ds-body">
        <section className="ds-panel" id="ds-results">
          {!visibleRun ? (
            <p className="ds-meta ds-results-placeholder" id="ds-results-placeholder">
              {isApiConfigured()
                ? 'Press Generate to see suggestions.'
                : 'Configure API URL and key in Settings to generate suggestions.'}
            </p>
          ) : (
            <div id="ds-results-content">
              <DeckSuggestResults
                generationRun={visibleRun}
                setScope={state.setScope}
                summary={summary}
                rulesDebug={debugEnabled}
                onAccept={(deckId, s) => void openAccept(deckId, s)}
                onDismiss={(id) => setDismissedIds((prev) => [...prev, id])}
                onNextPage={remaining.length ? handleNextPage : undefined}
                remainingCount={remaining.length}
                wishlistText={wishlistText}
                wishlistEmpty={!sessionAccepts.length}
              />
              {accepting ? (
                <AcceptDialogue
                  suggestion={accepting.suggestion}
                  deck={acceptDeck}
                  theory={
                    state.deckSelection.decks.find((d) => d.deck_id === accepting.deckId)
                      ?.ownership === 'theory'
                  }
                  protectedCards={[
                    ...(state.deckSelection.decks.find((d) => d.deck_id === accepting.deckId)?.profile
                      ?.protected_cards || []),
                    ...(state.deckSelection.decks.find((d) => d.deck_id === accepting.deckId)
                      ?.profile_preferences?.protected_cards || []),
                  ]}
                  onCancel={() => {
                    setAccepting(null);
                    setAcceptDeck(null);
                  }}
                  onSwap={(outId) => void saveSwap(outId)}
                  onSeeking={() => void saveSeeking()}
                />
              ) : null}
            </div>
          )}
        </section>

        <section className="ds-panel" id="ds-setup">
          <DeckSuggestSetup
            settings={state.settings}
            setSettings={persistSettings}
            setInputMode={state.ui.setInputMode}
            onSetInputMode={(mode) => {
              setState((prev) => ({
                ...prev,
                ui: { ...prev.ui, setInputMode: mode },
              }));
              persistSettings({ ...state.settings, setInputMode: mode });
            }}
            releaseId={state.ui.releaseId}
            onReleaseId={(value) =>
              setState((prev) => ({ ...prev, ui: { ...prev.ui, releaseId: value } }))
            }
            setCodesInput={state.ui.setCodesInput}
            onSetCodesInput={(value) =>
              setState((prev) => ({ ...prev, ui: { ...prev.ui, setCodesInput: value } }))
            }
            resolvedSetCodes={resolvedSetCodes}
            deckSelection={state.deckSelection}
            onDeckSelectionChange={(next: DeckSelection) =>
              setState((prev) => ({ ...prev, deckSelection: next }))
            }
            decksLoading={decksLoading}
          />
        </section>
      </div>
    </div>
  );
}
