import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CardSizePicker, useCardSize } from '../cards';
import { HubProgress, type HubProgressController } from '../lib/hub-progress';
import { loadDeckSuggestSettings, saveDeckSuggestSettings } from '../lib/hub-storage';
import { downloadSuggestionsJson, handoffSnapshotSummary } from '../lib/hub-utils';
import { escapeHtml } from '../lib/string-utils';
import { isApiConfigured } from '../api/hub-api';
import { DeckReviewSidebar } from '../deck-review/DeckReviewSidebar';
import { DeckReviewSuggestionPanel } from '../deck-review/DeckReviewSuggestionPanel';
import { checkProfilesConnected } from '../deck-review/profiles';
import {
  createInitialReviewState,
  deckReviewStatusCounts,
  getDeckById,
  handoffSnapshotDate,
  handoffStatusMessage,
  jumpToPendingSuggestion,
  loadSuggestionsData,
  navigatePendingSuggestion,
  pendingSuggestions,
  recordDecision,
  selectDeck,
} from '../deck-review/review';
import type { DeckReviewState, ReviewDecision, SuggestionsPayload } from '../deck-review/types';
import '../deck-review/deck-review.css';
import { DeckSuggestSetup } from './DeckSuggestSetup';
import { loadHubLibraryDecks } from './data';
import { applyDeckList } from './deck-load';
import { buildExport } from './export';
import { generateSuggestions } from './generation';
import { getGenerateReadiness } from './readiness';
import { proposePageIds, remainingIds } from './paging';
import { SuggestDeckLeaders } from './SuggestDeckLeaders';
import type { DeckSelection, DeckSuggestSettings, DeckSuggestState, SetInputMode } from './types';
import './deck-suggest.css';

function createSuggestState(): DeckSuggestState {
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

function buildMetaHtml(review: DeckReviewState): string {
  if (!review.data) {
    return 'Generate from rules, or upload a suggestions JSON file.';
  }
  const meta = review.data.meta;
  let html =
    '<strong>' +
    escapeHtml(meta.set_name || '') +
    '</strong> · ' +
    escapeHtml(meta.set_code || '') +
    ' · ' +
    escapeHtml(meta.generated_at || '') +
    ' · ' +
    review.data.decks.length +
    ' decks';
  const fromRules =
    review.transferSource === 'deck-suggest' || review.transferSource === 'generate';
  if (fromRules) {
    const snapDate = handoffSnapshotDate(review.data);
    const snapSummary = handoffSnapshotSummary(review.data);
    html += '<span class="dr-meta-chip">Rules';
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

export function DeckSuggestApp() {
  const [suggest, setSuggest] = useState<DeckSuggestState>(createSuggestState);
  const [review, setReview] = useState<DeckReviewState>(createInitialReviewState);
  const [error, setError] = useState('');
  const [decksLoading, setDecksLoading] = useState(true);
  const [processedIds, setProcessedIds] = useState<string[]>([]);
  const [navOpen, setNavOpen] = useState(false);
  const { size: cardSize, setSize: setCardSize, widthPx: cardWidthPx } = useCardSize();
  const progressRef = useRef<HubProgressController | null>(null);
  const progressHostRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;

  useEffect(() => {
    if (progressHostRef.current && !progressRef.current) {
      progressRef.current = HubProgress.mount(progressHostRef.current);
    }
  }, []);

  useEffect(() => {
    const settings = loadDeckSuggestSettings() as DeckSuggestSettings;
    const mode: SetInputMode = settings.setInputMode === 'codes' ? 'codes' : 'release';
    setSuggest((prev) => ({
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
    void checkProfilesConnected().then((connected) => {
      setReview((prev) => ({ ...prev, profilesConnected: connected }));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDecksLoading(true);
      try {
        const loaded = await loadHubLibraryDecks();
        if (cancelled) return;
        setSuggest((prev) => ({
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

  const readiness = useMemo(() => getGenerateReadiness(suggest), [suggest]);
  const blockedReason = readiness.ok
    ? ''
    : readiness.items.find((item) => !item.ok)?.label || 'Complete setup first';
  const remaining = remainingIds(
    suggest.deckSelection.decks.map((d) => d.deck_id),
    processedIds,
  );
  const loaded = !!review.data;
  const activeDeck = getDeckById(review.data, review.activeDeckId);
  const tallyCounts = useMemo(() => {
    if (!activeDeck) return null;
    return deckReviewStatusCounts(activeDeck, review.progress, review.deckPrefs);
  }, [activeDeck, review.progress, review.deckPrefs]);

  const filmstripPending = useMemo(() => {
    if (!activeDeck || review.showAllMode) return null;
    const pending = pendingSuggestions(activeDeck, review.progress, review.deckPrefs);
    if (pending.length < 2) return null;
    const activeIndex = Math.min(review.suggestionIndex, Math.max(pending.length - 1, 0));
    return { pending, activeIndex };
  }, [activeDeck, review.showAllMode, review.progress, review.deckPrefs, review.suggestionIndex]);

  const persistSettings = useCallback((settings: DeckSuggestSettings) => {
    saveDeckSuggestSettings(settings);
    setSuggest((prev) => ({ ...prev, settings }));
  }, []);

  const applyLoaded = useCallback(
    async (data: SuggestionsPayload, transferSource?: DeckReviewState['transferSource']) => {
      setError('');
      try {
        const next = await loadSuggestionsData(reviewRef.current, data, transferSource);
        setReview(next);
        if (next.data) {
          const statusMsg = handoffStatusMessage(next.data, next.transferSource);
          if (statusMsg) {
            const fromRules =
              next.transferSource === 'deck-suggest' || next.transferSource === 'generate';
            if (fromRules && handoffSnapshotSummary(next.data).missingSnapshots === 0) {
              setReview((prev) => ({ ...prev, profileStatus: statusMsg }));
            } else if (handoffSnapshotSummary(next.data).missingSnapshots > 0) {
              setError(statusMsg);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

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
    setReview((prev) => {
      if (!prev.fileId) {
        return prev;
      }
      return recordDecision(prev, suggestionId, decision, advance);
    });
    setError('');
  }

  const handleNavigateSuggestion = useCallback((delta: number) => {
    setReview((prev) => navigatePendingSuggestion(prev, delta));
  }, []);

  const handleJumpSuggestion = useCallback((index: number) => {
    setReview((prev) => jumpToPendingSuggestion(prev, index));
  }, []);

  function handleSelectDeck(deckId: string) {
    setReview((prev) => selectDeck(prev, deckId));
  }

  function handleBackToSetup() {
    setReview(createInitialReviewState());
    setSuggest((prev) => ({ ...prev, generationRun: null }));
    setError('');
  }

  function handleNextPage() {
    const cap = suggest.generationRun?.cap || 20;
    const nextIds = proposePageIds(
      suggest.deckSelection.decks.map((d) => d.deck_id),
      processedIds,
      cap,
    );
    setSuggest((prev) => ({
      ...prev,
      generationRun: null,
      deckSelection: { ...prev.deckSelection, selectedIds: nextIds },
    }));
    setReview(createInitialReviewState());
  }

  async function handleGenerate() {
    if (!readiness.ok) return;
    setError('');
    setSuggest((prev) => ({ ...prev, generating: true }));
    progressRef.current?.start({ label: 'Generating…' });
    try {
      const nextSettings = {
        ...suggest.settings,
        setCodes: suggest.ui.setCodesInput,
        releaseId: suggest.ui.releaseId,
        setInputMode: suggest.ui.setInputMode,
      };
      persistSettings(nextSettings);
      const run = await generateSuggestions(
        { ...suggest, settings: nextSettings },
        (update) => progressRef.current?.update(update),
        suggest.generationRun?.cap || 20,
      );
      setProcessedIds((prev) => [...new Set([...prev, ...suggest.deckSelection.selectedIds])]);
      const nextSuggest: DeckSuggestState = {
        ...suggest,
        settings: nextSettings,
        generating: false,
        generationRun: run,
        setScope: run.setCodes?.length
          ? {
              codes: run.setCodes,
              codesKey: run.setCodesKey,
              cards: [],
              complete: true,
            }
          : suggest.setScope,
      };
      setSuggest(nextSuggest);
      const payload = buildExport(nextSuggest);
      await applyLoaded(payload, 'generate');
      progressRef.current?.finish({
        label: 'Generated suggestions for ' + run.deckResults.length + ' deck(s).',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSuggest((prev) => ({ ...prev, generating: false }));
      progressRef.current?.finish({ label: msg, variant: 'error' });
    }
  }

  return (
    <div
      className={'deck-suggest-app' + (loaded ? ' deck-suggest-reviewing' : '')}
      style={{ ['--db-card-w' as string]: `${cardWidthPx}px` }}
    >
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
                {loaded ? (
                  <button
                    type="button"
                    className="dr-btn dr-btn-ghost dr-chrome-back"
                    id="dr-back-setup"
                    aria-label="New source"
                    title="Back to setup"
                    onClick={handleBackToSetup}
                  >
                    ‹
                  </button>
                ) : null}
                <h2>Deck Suggest</h2>
                <div className="dr-meta" id="ds-meta" dangerouslySetInnerHTML={{ __html: buildMetaHtml(review) }} />
              </div>
              <div className="hub-progress-host dr-chrome-progress" id="ds-progress-host" ref={progressHostRef} />
              {loaded ? (
                <div className="dr-chrome-actions">
                  {tallyCounts ? (
                    <span className="dr-chrome-tally" aria-live="polite">
                      {tallyCounts.pending} pending · {tallyCounts.accepted} accepted · {tallyCounts.rejected}{' '}
                      rejected
                      {tallyCounts.skipped ? ` · ${tallyCounts.skipped} skipped` : ''}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="dr-btn dr-btn-ghost"
                    id="dr-toggle-view"
                    onClick={() => setReview((prev) => ({ ...prev, showAllMode: !prev.showAllMode }))}
                  >
                    {review.showAllMode ? 'One at a time' : 'Show all'}
                  </button>
                  <CardSizePicker size={cardSize} onChange={setCardSize} />
                </div>
              ) : (
                <div className="dr-chrome-actions">
                  <button
                    type="button"
                    className="dr-btn dr-btn-primary"
                    id="ds-generate"
                    disabled={!readiness.ok || suggest.generating}
                    title={!readiness.ok ? blockedReason : ''}
                    onClick={() => void handleGenerate()}
                  >
                    Generate
                  </button>
                </div>
              )}
            </header>
            {!loaded && !readiness.ok ? (
              <p className="ds-meta ds-blocked-reason" id="ds-blocked-reason">
                {blockedReason}
              </p>
            ) : null}
          </div>

          {error ? (
            <div className="dr-error" id="ds-error">
              {error}
            </div>
          ) : null}

          <div className="dr-body" id="ds-body">
            {!loaded ? (
              <div className="ds-setup-phase">
                <p className="ds-meta ds-results-placeholder" id="ds-results-placeholder">
                  {isApiConfigured()
                    ? 'Configure a set release, select decks, then Generate — or upload a suggestions JSON from the sidebar.'
                    : 'Configure API URL and key in Settings to generate, or upload a suggestions JSON from the sidebar.'}
                </p>
                {remaining.length && processedIds.length ? (
                  <p className="ds-meta">
                    {remaining.length} deck(s) left unprocessed.{' '}
                    <button type="button" className="dr-btn dr-btn-ghost" onClick={handleNextPage}>
                      Select next page
                    </button>
                  </p>
                ) : null}
                <section className="ds-panel" id="ds-setup">
                  <DeckSuggestSetup
                    settings={suggest.settings}
                    setSettings={persistSettings}
                    setInputMode={suggest.ui.setInputMode}
                    onSetInputMode={(mode) => {
                      setSuggest((prev) => ({
                        ...prev,
                        ui: { ...prev.ui, setInputMode: mode },
                      }));
                      persistSettings({ ...suggest.settings, setInputMode: mode });
                    }}
                    releaseId={suggest.ui.releaseId}
                    onReleaseId={(value) =>
                      setSuggest((prev) => ({ ...prev, ui: { ...prev.ui, releaseId: value } }))
                    }
                    setCodesInput={suggest.ui.setCodesInput}
                    onSetCodesInput={(value) =>
                      setSuggest((prev) => ({ ...prev, ui: { ...prev.ui, setCodesInput: value } }))
                    }
                    resolvedSetCodes={suggest.generationRun?.setCodes || []}
                    deckSelection={suggest.deckSelection}
                    onDeckSelectionChange={(next: DeckSelection) =>
                      setSuggest((prev) => ({ ...prev, deckSelection: next }))
                    }
                    decksLoading={decksLoading}
                  />
                </section>
              </div>
            ) : (
              <div id="dr-content">
                {activeDeck ? (
                  <SuggestDeckLeaders
                    deck={activeDeck}
                    filmstrip={
                      filmstripPending
                        ? {
                            pending: filmstripPending.pending,
                            activeIndex: filmstripPending.activeIndex,
                            onJump: handleJumpSuggestion,
                          }
                        : null
                    }
                  />
                ) : null}
                <div id="dr-suggestion-panel">
                  <DeckReviewSuggestionPanel
                    deck={activeDeck}
                    state={review}
                    onDecision={handleDecision}
                    onProfileUpdate={(patch) => setReview((prev) => ({ ...prev, ...patch }))}
                    onError={setError}
                    onNavigateSuggestion={handleNavigateSuggestion}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DeckReviewSidebar
          state={review}
          navOpen={navOpen}
          onCloseNav={() => setNavOpen(false)}
          onUploadClick={() => fileInputRef.current?.click()}
          onFileChange={handleFileUpload}
          onDownloadJson={() => {
            if (review.data) {
              downloadSuggestionsJson(review.data);
            }
          }}
          onSelectDeck={handleSelectDeck}
          fileInputRef={fileInputRef}
        />
      </div>
    </div>
  );
}
