import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HubProgress, type HubProgressController } from '../lib/hub-progress';
import {
  loadDeckSuggestSettings,
  normalizeSetCodesKey,
  saveDeckSuggestSettings,
} from '../lib/hub-storage';
import { ProfileSync } from '../mtg/profile-sync';
import { DeckSuggestResults } from './DeckSuggestResults';
import { DeckSuggestSetup, resolveDeckLoadTab } from './DeckSuggestSetup';
import { tryRestoreSetPool } from './data';
import { buildSummary, downloadJson, hasReviewableSuggestions } from './export';
import { generateSuggestions, restoreSetPoolFromSettings, transferToDeckReview } from './generation';
import { getGenerateReadiness, normalizeCodesInput, rulesDebugEnabled } from './readiness';
import type { DeckLoadTab, DeckSelection, DeckSuggestSettings, DeckSuggestState, SetScope } from './types';
import './deck-suggest.css';

function createInitialState(): DeckSuggestState {
  const settings = loadDeckSuggestSettings() as DeckSuggestSettings;
  return {
    setScope: null,
    deckSelection: { folderUrl: '', decks: [], selectedIds: [] },
    profilesConnected: false,
    generationRun: null,
    ui: { setCodesInput: settings.setCodes || '', deckLoadTab: null },
    settings,
    statusMessage: '',
    generating: false,
  };
}

export function DeckSuggestApp() {
  const [state, setState] = useState<DeckSuggestState>(createInitialState);
  const [error, setError] = useState('');
  const [deckLoadTab, setDeckLoadTab] = useState<DeckLoadTab>(() =>
    resolveDeckLoadTab({ deckLoadTab: null }, loadDeckSuggestSettings() as DeckSuggestSettings),
  );
  const progressRef = useRef<HubProgressController | null>(null);
  const progressHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (progressHostRef.current && !progressRef.current) {
      progressRef.current = HubProgress.mount(progressHostRef.current);
    }
  }, []);

  useEffect(() => {
    const settings = loadDeckSuggestSettings() as DeckSuggestSettings;
    const setCodesInput = settings.setCodes || '';
    const scope = restoreSetPoolFromSettings(
      setCodesInput,
      tryRestoreSetPool,
      normalizeSetCodesKey,
      normalizeCodesInput,
    );
    setState((prev) => ({
      ...prev,
      settings,
      ui: { ...prev.ui, setCodesInput },
      setScope: scope,
    }));
    setDeckLoadTab(resolveDeckLoadTab({ deckLoadTab: null }, settings));
  }, []);

  useEffect(() => {
    void ProfileSync.getProfilesDir().then((handle) => {
      setState((prev) => ({ ...prev, profilesConnected: !!handle }));
    });
  }, []);

  const readiness = useMemo(
    () =>
      getGenerateReadiness({
        ...state,
        ui: { ...state.ui, setCodesInput: state.ui.setCodesInput },
      }),
    [state],
  );

  const canReview = !!state.generationRun && hasReviewableSuggestions(state);
  const summary = state.generationRun ? buildSummary(state) : null;
  const debugEnabled = rulesDebugEnabled(state.settings);

  const persistSettings = useCallback((settings: DeckSuggestSettings) => {
    saveDeckSuggestSettings(settings);
    setState((prev) => ({ ...prev, settings }));
  }, []);

  const onProgressStart = useCallback((opts: { label: string; indeterminate?: boolean }) => {
    progressRef.current?.start(opts);
  }, []);

  const onProgressUpdate = useCallback((opts: { label: string }) => {
    progressRef.current?.update(opts);
  }, []);

  const onProgressFinish = useCallback((opts: { label: string; variant?: 'error' }) => {
    progressRef.current?.finish(opts);
  }, []);

  async function handleGenerate() {
    if (!readiness.ok) {
      return;
    }
    setError('');
    setState((prev) => ({ ...prev, generating: true }));
    progressRef.current?.start({ label: 'Generating suggestions…' });
    try {
      const run = await generateSuggestions(
        { ...state, generating: true },
        (update) => progressRef.current?.update(update),
      );
      setState((prev) => ({ ...prev, generationRun: run, generating: false }));
      progressRef.current?.finish({ label: 'Generated suggestions for ' + run.deckResults.length + ' deck(s).' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setState((prev) => ({ ...prev, generating: false }));
      progressRef.current?.finish({ label: msg, variant: 'error' });
    }
  }

  async function handleReviewHandoff() {
    if (!canReview) {
      return;
    }
    try {
      await transferToDeckReview(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDownload() {
    if (!state.generationRun) {
      return;
    }
    try {
      downloadJson(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDeckLoadTab(tab: DeckLoadTab) {
    setDeckLoadTab(tab);
    const nextSettings = { ...state.settings, deckLoadTab: tab };
    persistSettings(nextSettings);
  }

  return (
    <div className="deck-suggest-app">
      <div className="hub-sticky-chrome">
        <header className="ds-header">
          <div className="ds-header-top">
            <div>
              <h2>Deck Suggest</h2>
              <p className="ds-meta">
                Profile-based replacement suggestions for Commander decks (no LLM).
              </p>
            </div>
            <div className="ds-action-bar">
              <button
                type="button"
                className="ds-btn ds-btn-primary"
                id="ds-generate"
                disabled={!readiness.ok}
                onClick={() => void handleGenerate()}
              >
                Generate suggestions
              </button>
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
                disabled={!state.generationRun}
                onClick={handleDownload}
              >
                Download JSON
              </button>
            </div>
          </div>
          <p className="ds-requirements-label">Generate requires:</p>
          <ul className="ds-requirements" id="ds-requirements">
            {readiness.items.map((item) => (
              <li key={item.id} className={item.ok ? 'ds-req-ok' : 'ds-req-missing'}>
                {item.label}
              </li>
            ))}
          </ul>
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
          {!state.generationRun ? (
            <p className="ds-meta ds-results-placeholder" id="ds-results-placeholder">
              Run Generate to see suggestions.
            </p>
          ) : (
            <div id="ds-results-content">
              <DeckSuggestResults
                generationRun={state.generationRun}
                setScope={state.setScope}
                summary={summary}
                rulesDebug={debugEnabled}
              />
            </div>
          )}
        </section>

        <section className="ds-panel" id="ds-setup">
          <DeckSuggestSetup
            settings={state.settings}
            setSettings={persistSettings}
            setCodesInput={state.ui.setCodesInput}
            onSetCodesInput={(value) =>
              setState((prev) => ({ ...prev, ui: { ...prev.ui, setCodesInput: value } }))
            }
            setScope={state.setScope}
            onSetScope={(scope: SetScope | null) => setState((prev) => ({ ...prev, setScope: scope }))}
            deckSelection={state.deckSelection}
            onDeckSelectionChange={(next: DeckSelection) =>
              setState((prev) => ({ ...prev, deckSelection: next }))
            }
            deckLoadTab={deckLoadTab}
            onDeckLoadTab={handleDeckLoadTab}
            profilesConnected={state.profilesConnected}
            onError={setError}
            onClearError={() => setError('')}
            onProgressStart={onProgressStart}
            onProgressUpdate={onProgressUpdate}
            onProgressFinish={onProgressFinish}
          />
        </section>
      </div>
    </div>
  );
}
