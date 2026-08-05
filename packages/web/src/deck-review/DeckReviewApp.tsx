import { useCallback, useEffect, useRef, useState } from 'react';
import { consumeReviewHandoff, navigateHub } from '../lib/hub-storage';
import { HubProgress, type HubProgressController } from '../lib/hub-progress';
import { bridgeAvailable, downloadSuggestionsJson, handoffSnapshotSummary } from '../lib/hub-utils';
import { escapeHtml } from '../lib/string-utils';
import { refreshActiveDeckSnapshot, refreshAllDeckSnapshots } from './archidekt-bridge';
import { DeckReviewSidebar } from './DeckReviewSidebar';
import { DeckReviewSuggestionPanel } from './DeckReviewSuggestionPanel';
import { checkProfilesConnected, connectProfilesDir } from './profiles';
import {
  createInitialReviewState,
  getDeckById,
  handoffSnapshotDate,
  handoffStatusMessage,
  jumpToPendingSuggestion,
  loadSuggestionsData,
  navigatePendingSuggestion,
  recordDecision,
  selectDeck,
} from './review';
import type { DeckReviewState, ReviewDecision, StatusCardTab, SuggestionsPayload } from './types';
import './deck-review.css';

const LATEST_URL = 'data/suggestions/latest.json';

function buildMetaHtml(state: DeckReviewState): string {
  if (!state.data) {
    return 'Load set-update suggestions to review swaps deck by deck.';
  }
  const meta = state.data.meta;
  let html =
    '<strong>' +
    escapeHtml(meta.set_name || '') +
    '</strong> · ' +
    escapeHtml(meta.set_code || '') +
    ' · ' +
    escapeHtml(meta.generated_at || '') +
    ' · ' +
    state.data.decks.length +
    ' decks';
  if (state.transferSource === 'deck-suggest') {
    const snapDate = handoffSnapshotDate(state.data);
    const snapSummary = handoffSnapshotSummary(state.data);
    html += '<span class="dr-meta-chip">Suggest';
    if (snapSummary.allReady) {
      html += ' · ready';
    }
    if (snapDate) {
      html += ' · ' + escapeHtml(snapDate);
    }
    html += '</span>';
  } else if (meta.notes) {
    html += '<span class="dr-meta-chip" title="' + escapeHtml(String(meta.notes)) + '">Notes</span>';
  }
  return html;
}

export function DeckReviewApp() {
  const [state, setState] = useState<DeckReviewState>(createInitialReviewState);
  const [error, setError] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const progressRef = useRef<HubProgressController | null>(null);
  const progressHostRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bridgeOk = bridgeAvailable();

  useEffect(() => {
    if (progressHostRef.current && !progressRef.current) {
      progressRef.current = HubProgress.mount(progressHostRef.current);
    }
  }, []);

  useEffect(() => {
    void checkProfilesConnected().then((connected) => {
      setState((prev) => ({ ...prev, profilesConnected: connected }));
    });
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;

  const applyLoaded = useCallback(async (data: SuggestionsPayload, transferSource?: DeckReviewState['transferSource']) => {
    setError('');
    try {
      const next = await loadSuggestionsData(stateRef.current, data, transferSource);
      setState(next);
      if (next.data) {
        const statusMsg = handoffStatusMessage(next.data, next.transferSource);
        if (statusMsg) {
          if (next.transferSource === 'deck-suggest' && handoffSnapshotSummary(next.data).missingSnapshots === 0) {
            setState((prev) => ({ ...prev, profileStatus: statusMsg }));
          } else if (handoffSnapshotSummary(next.data).missingSnapshots > 0) {
            setError(statusMsg);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    const handoff = consumeReviewHandoff() as {
      data?: SuggestionsPayload;
      source?: DeckReviewState['transferSource'];
    } | null;
    if (handoff?.data) {
      void applyLoaded(handoff.data, handoff.source || 'deck-suggest');
    }
  }, [applyLoaded]);

  async function handleFetchLatest() {
    setError('');
    try {
      const resp = await fetch(LATEST_URL + '?t=' + Date.now());
      if (!resp.ok) {
        throw new Error('Could not fetch ' + LATEST_URL + ' (' + resp.status + ')');
      }
      const data = (await resp.json()) as SuggestionsPayload;
      await applyLoaded(data, 'latest');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as SuggestionsPayload;
        void applyLoaded(data, 'upload');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
  }

  function handleDecision(suggestionId: string, decision: ReviewDecision, advance: boolean) {
    setState((prev) => {
      if (!prev.fileId) {
        return prev;
      }
      return recordDecision(prev, suggestionId, decision, advance);
    });
    setError('');
  }

  const handleNavigateSuggestion = useCallback((delta: number) => {
    setState((prev) => navigatePendingSuggestion(prev, delta));
  }, []);

  const handleJumpSuggestion = useCallback((index: number) => {
    setState((prev) => jumpToPendingSuggestion(prev, index));
  }, []);

  function handleSelectDeck(deckId: string) {
    setState((prev) => selectDeck(prev, deckId));
  }

  async function handleConnectProfiles() {
    if (state.profilesConnected) {
      return;
    }
    try {
      await connectProfilesDir();
      setState((prev) => ({
        ...prev,
        profilesConnected: true,
        profileStatus: 'Profiles folder connected.',
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        profileStatus: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  async function handleRefreshAllDecks() {
    if (!state.data) {
      return;
    }
    await refreshAllDeckSnapshots(
      state.data.decks,
      progressRef.current,
      (updatedDecks) => {
        setState((prev) =>
          prev.data
            ? {
                ...prev,
                data: { ...prev.data, decks: updatedDecks },
              }
            : prev,
        );
      },
      (msg) => {
        if (!bridgeAvailable()) {
          setState((prev) => ({ ...prev, profileStatus: 'Install Archidekt Deck Review Bridge userscript for live refresh.' }));
        } else {
          setError(msg);
        }
      },
    );
  }

  async function handleRefreshDeck() {
    const deck = getDeckById(state.data, state.activeDeckId);
    if (!deck) {
      return;
    }
    try {
      await refreshActiveDeckSnapshot(deck, progressRef.current);
      setState((prev) => ({ ...prev }));
    } catch {
      /* error shown via progress */
    }
  }

  const activeDeck = getDeckById(state.data, state.activeDeckId);
  const loaded = !!state.data;

  return (
    <div className="deck-review-app">
      <button
        type="button"
        id="dr-right-nav-toggle"
        className="dr-right-nav-toggle"
        aria-label="Decks"
        aria-expanded={navOpen}
        onClick={() => setNavOpen((o) => !o)}
      >
        Decks
      </button>
      <div
        id="dr-right-nav-backdrop"
        className={'dr-right-nav-backdrop' + (navOpen ? ' open' : '')}
        onClick={() => setNavOpen(false)}
      />

      <div className="dr-layout">
        <div className="dr-main-area">
          <div className="hub-sticky-chrome">
            <header className="dr-chrome">
              <div className="dr-chrome-primary">
                <h2>Deck Review</h2>
                <div className="dr-meta" id="dr-meta" dangerouslySetInnerHTML={{ __html: buildMetaHtml(state) }} />
              </div>
              <div className="hub-progress-host dr-chrome-progress" id="dr-progress-host" ref={progressHostRef} />
              {loaded ? (
                <div className="dr-chrome-actions">
                  {activeDeck?.archidekt_url ? (
                    <a
                      className="dr-deck-archidekt-link dr-chrome-archidekt"
                      href={activeDeck.archidekt_url}
                      target="_blank"
                      rel="noopener"
                    >
                      Archidekt
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="dr-btn dr-btn-ghost"
                    id="dr-toggle-view"
                    onClick={() => setState((prev) => ({ ...prev, showAllMode: !prev.showAllMode }))}
                  >
                    {state.showAllMode ? 'One at a time' : 'Show all'}
                  </button>
                </div>
              ) : null}
            </header>
          </div>

          {error ? (
            <div className="dr-error" id="dr-error">
              {error}
            </div>
          ) : null}

          <div className="dr-body" id="dr-body">
            {!loaded ? (
              <div className="dr-empty" id="dr-empty-state">
                <p>Upload a suggestions JSON file, transfer from Deck Suggest, or click Refresh latest.</p>
                <div className="dr-empty-actions">
                  <button
                    type="button"
                    className="dr-btn dr-btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload JSON
                  </button>
                  <button
                    type="button"
                    className="dr-btn dr-btn-ghost"
                    onClick={() => navigateHub('#/deck-suggest')}
                  >
                    Open Deck Suggest
                  </button>
                  <button type="button" className="dr-btn dr-btn-ghost" onClick={() => void handleFetchLatest()}>
                    Refresh latest
                  </button>
                </div>
              </div>
            ) : (
              <div id="dr-content">
                <div id="dr-suggestion-panel">
                  <DeckReviewSuggestionPanel
                    deck={activeDeck}
                    state={state}
                    onDecision={handleDecision}
                    onProfileUpdate={(patch) => setState((prev) => ({ ...prev, ...patch }))}
                    onTabChange={(tab: StatusCardTab) => setState((prev) => ({ ...prev, statusCardTab: tab }))}
                    onRefreshDeck={() => void handleRefreshDeck()}
                    onApplyStaged={(message) => setState((prev) => ({ ...prev, profileStatus: message }))}
                    onError={setError}
                    onNavigateSuggestion={handleNavigateSuggestion}
                    onJumpSuggestion={handleJumpSuggestion}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DeckReviewSidebar
          state={state}
          navOpen={navOpen}
          bridgeOk={bridgeOk}
          onCloseNav={() => setNavOpen(false)}
          onFetchLatest={() => void handleFetchLatest()}
          onUploadClick={() => fileInputRef.current?.click()}
          onFileChange={handleFileUpload}
          onDownloadJson={() => {
            if (state.data) {
              downloadSuggestionsJson(state.data);
            }
          }}
          onConnectProfiles={() => void handleConnectProfiles()}
          onRefreshAllDecks={() => void handleRefreshAllDecks()}
          onSelectDeck={handleSelectDeck}
          fileInputRef={fileInputRef}
        />
      </div>
    </div>
  );
}
