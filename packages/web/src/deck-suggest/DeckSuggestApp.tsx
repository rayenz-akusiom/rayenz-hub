import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CardSizePicker, useCardSize } from '../cards';
import { HubProgress, type HubProgressController } from '../lib/hub-progress';
import { loadDeckSuggestSettings, saveDeckSuggestSettings } from '../lib/hub-storage';
import { acceptAllPendingAsSeeking } from '../deck-review/bulk-seeking';
import { DeckReviewSidebar } from '../deck-review/DeckReviewSidebar';
import { DeckReviewSuggestionPanel } from '../deck-review/DeckReviewSuggestionPanel';
import { MissingCardsProfileSection } from '../deck-review/MissingCardsProfileSection';
import { checkProfilesConnected } from '../deck-review/profiles';
import {
  appendDeckSuggestions,
  createInitialReviewState,
  getDeckById,
  handoffStatusMessage,
  jumpToPendingSuggestion,
  loadSuggestionsData,
  navigatePendingSuggestion,
  patchSuggestionLozenges,
  pendingSuggestions,
  promoteConfirmedLozengesOnDeck,
  recordDecision,
  selectDeck,
} from '../deck-review/review';
import type { DeckReviewState, ReviewDecision, SuggestionsPayload } from '../deck-review/types';
import type { ProfileLozenge, ProfileLozengeUpdates, Suggestion } from '@rayenz-hub/shared';
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

function reviewSetCodes(
  generationCodes?: string[],
  meta?: { set_codes?: string[]; set_code?: string },
  scopeCodes?: string[],
): string[] {
  if (generationCodes?.length) return generationCodes;
  if (meta?.set_codes?.length) return meta.set_codes;
  if (meta?.set_code) return [String(meta.set_code)];
  return scopeCodes || [];
}

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

export function DeckSuggestApp() {
  const [suggest, setSuggest] = useState<DeckSuggestState>(createSuggestState);
  const [review, setReview] = useState<DeckReviewState>(createInitialReviewState);
  const [error, setError] = useState('');
  const [decksLoading, setDecksLoading] = useState(true);
  const [processedIds, setProcessedIds] = useState<string[]>([]);
  const [navOpen, setNavOpen] = useState(false);
  const [bulkSeeking, setBulkSeeking] = useState(false);
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
  const pendingForActiveDeck = useMemo(() => {
    if (!activeDeck) return [];
    return pendingSuggestions(activeDeck, review.progress, review.deckPrefs);
  }, [activeDeck, review.progress, review.deckPrefs]);

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
            setError(statusMsg);
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

  function handleAddMissingSuggestion(suggestion: Suggestion) {
    const deckId = String(activeDeck?.deck_id || '');
    if (!deckId) return;
    setReview((prev) => appendDeckSuggestions(prev, deckId, [suggestion]));
    setSuggest((prev) => {
      const run = prev.generationRun;
      if (!run?.deckResults?.length) return prev;
      return {
        ...prev,
        generationRun: {
          ...run,
          deckResults: run.deckResults.map((result) => {
            if (String(result.deck.deck_id) !== deckId) return result;
            const existing = (result.suggestions || []).some(
              (s) => String(s.suggestion_id) === String(suggestion.suggestion_id),
            );
            if (existing) return result;
            return {
              ...result,
              suggestions: [...(result.suggestions || []), suggestion],
            };
          }),
        },
      };
    });
  }

  function handleToggleLozenge(suggestionId: string, lozenges: ProfileLozenge[]) {
    const deckId = String(activeDeck?.deck_id || '');
    if (!deckId) return;
    setReview((prev) => patchSuggestionLozenges(prev, deckId, suggestionId, lozenges));
    setSuggest((prev) => {
      const run = prev.generationRun;
      if (!run?.deckResults?.length) return prev;
      return {
        ...prev,
        generationRun: {
          ...run,
          deckResults: run.deckResults.map((result) => {
            if (String(result.deck.deck_id) !== deckId) return result;
            return {
              ...result,
              suggestions: (result.suggestions || []).map((s) =>
                String(s.suggestion_id) === String(suggestionId)
                  ? { ...s, profile_lozenges: lozenges }
                  : s,
              ),
            };
          }),
        },
      };
    });
  }

  function handleConfirmedProfileTags(_suggestionId: string, updates: ProfileLozengeUpdates) {
    const deckId = String(activeDeck?.deck_id || '');
    if (!deckId) return;
    setReview((prev) => promoteConfirmedLozengesOnDeck(prev, deckId, updates));
  }

  async function handleAcceptAllSeeking() {
    if (!activeDeck || bulkSeeking || !pendingForActiveDeck.length) {
      return;
    }
    const count = pendingForActiveDeck.length;
    const confirmed = window.confirm(
      `Accept all ${count} pending suggestion${count === 1 ? '' : 's'} as Seeking for ${activeDeck.deck_name}?`,
    );
    if (!confirmed) {
      return;
    }
    setBulkSeeking(true);
    setError('');
    try {
      const snapshot = pendingForActiveDeck.slice();
      const result = await acceptAllPendingAsSeeking(activeDeck, snapshot, {
        onAccepted: (suggestionId, accepted) => {
          setReview((prev) => {
            if (!prev.fileId) {
              return prev;
            }
            return recordDecision(prev, suggestionId, { status: 'accepted', accepted }, false);
          });
        },
        onConfirmedProfileTags: handleConfirmedProfileTags,
      });
      if (result.failed.length) {
        const first = result.failed[0]!;
        setError(
          `Accepted ${result.accepted} as Seeking; ${result.failed.length} failed (e.g. ${first.error}).`,
        );
        setReview((prev) => ({
          ...prev,
          profileStatus: `Accepted ${result.accepted} Seeking; ${result.failed.length} failed.`,
        }));
      } else {
        setReview((prev) => ({
          ...prev,
          profileStatus: `Accepted ${result.accepted} suggestion${result.accepted === 1 ? '' : 's'} as Seeking.`,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkSeeking(false);
    }
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
                    aria-label="Back to setup"
                    title="Back to setup"
                    onClick={handleBackToSetup}
                  >
                    ‹
                  </button>
                ) : null}
                <h2>Deck Suggest</h2>
              </div>
              {loaded ? (
                <div className="dr-chrome-actions">
                  <button
                    type="button"
                    className="dr-btn dr-btn-ghost"
                    id="dr-toggle-view"
                    onClick={() => setReview((prev) => ({ ...prev, showAllMode: !prev.showAllMode }))}
                  >
                    {review.showAllMode ? 'One at a time' : 'Show all'}
                  </button>
                  <button
                    type="button"
                    className="dr-btn dr-btn-ghost"
                    id="dr-accept-all-seeking"
                    disabled={bulkSeeking || pendingForActiveDeck.length === 0}
                    title={
                      pendingForActiveDeck.length === 0
                        ? 'No pending suggestions'
                        : `Accept ${pendingForActiveDeck.length} pending as Seeking`
                    }
                    onClick={() => void handleAcceptAllSeeking()}
                  >
                    {bulkSeeking ? 'Accepting…' : 'Accept all Seeking'}
                  </button>
                  <CardSizePicker size={cardSize} onChange={setCardSize} />
                </div>
              ) : (
                <div className="dr-chrome-actions">
                  <button
                    type="button"
                    className="dr-btn dr-btn-ghost"
                    id="ds-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload JSON
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="dr-file-input"
                    className="dr-file-input"
                    accept=".json,application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(file);
                      }
                      e.target.value = '';
                    }}
                  />
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
            <div
              className="hub-progress-host dr-chrome-progress-below"
              id="ds-progress-host"
              ref={progressHostRef}
            />
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
                {activeDeck ? <SuggestDeckLeaders deck={activeDeck} /> : null}
                <div id="dr-suggestion-panel">
                  <DeckReviewSuggestionPanel
                    deck={activeDeck}
                    state={review}
                    onDecision={handleDecision}
                    onProfileUpdate={(patch) => setReview((prev) => ({ ...prev, ...patch }))}
                    onError={setError}
                    onNavigateSuggestion={handleNavigateSuggestion}
                    onJumpSuggestion={handleJumpSuggestion}
                    onToggleLozenge={handleToggleLozenge}
                    onConfirmedProfileTags={handleConfirmedProfileTags}
                  />
                </div>
                {activeDeck ? (
                  <MissingCardsProfileSection
                    deck={activeDeck}
                    setCodes={reviewSetCodes(
                      suggest.generationRun?.setCodes,
                      review.data?.meta,
                      suggest.setScope?.codes,
                    )}
                    onAddSuggestion={handleAddMissingSuggestion}
                    onStatus={(message) => setReview((prev) => ({ ...prev, profileStatus: message }))}
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>

        <DeckReviewSidebar
          state={review}
          navOpen={navOpen}
          onCloseNav={() => setNavOpen(false)}
          onSelectDeck={handleSelectDeck}
        />
      </div>
    </div>
  );
}
