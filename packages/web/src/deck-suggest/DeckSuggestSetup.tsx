import { isLocalHub } from '../lib/hub-utils';
import { applyDeckList, selectAllDecks, toggleDeckSelection } from './deck-load';
import { deckSuggestHeaderText } from './display';
import { findReleaseEntry, listReleaseOptions } from './releases';
import { ReleaseSelectOptgroups } from './ReleaseSelectOptgroups';
import type { DeckSelection, DeckSuggestSettings, SetInputMode } from './types';

type SetupProps = {
  settings: DeckSuggestSettings;
  setSettings: (next: DeckSuggestSettings) => void;
  setInputMode: SetInputMode;
  onSetInputMode: (mode: SetInputMode) => void;
  releaseId: string;
  onReleaseId: (value: string) => void;
  setCodesInput: string;
  onSetCodesInput: (value: string) => void;
  resolvedSetCodes: string[];
  deckSelection: DeckSelection;
  onDeckSelectionChange: (next: DeckSelection) => void;
  decksLoading: boolean;
};

export function DeckSuggestSetup({
  settings,
  setSettings,
  setInputMode,
  onSetInputMode,
  releaseId,
  onReleaseId,
  setCodesInput,
  onSetCodesInput,
  resolvedSetCodes,
  deckSelection,
  onDeckSelectionChange,
  decksLoading,
}: SetupProps) {
  const decks = deckSelection.decks || [];
  const selected = deckSelection.selectedIds || [];
  const releases = listReleaseOptions();
  const selectedRelease = findReleaseEntry(releaseId);
  const previewCodes = resolvedSetCodes.length
    ? resolvedSetCodes
    : selectedRelease?.set_codes || [];

  function saveSettings(next: DeckSuggestSettings) {
    setSettings(next);
  }

  return (
    <>
      <h3>Setup</h3>
      <p className="ds-meta">Pick a set release, choose decks, then Generate.</p>

      <div className="ds-set-mode-tabs" role="tablist" aria-label="Set input mode">
        <button
          type="button"
          role="tab"
          className={'ds-deck-load-tab' + (setInputMode === 'release' ? ' active' : '')}
          aria-selected={setInputMode === 'release'}
          id="ds-mode-release"
          onClick={() => onSetInputMode('release')}
        >
          Set release
        </button>
        <button
          type="button"
          role="tab"
          className={'ds-deck-load-tab' + (setInputMode === 'codes' ? ' active' : '')}
          aria-selected={setInputMode === 'codes'}
          id="ds-mode-codes"
          onClick={() => onSetInputMode('codes')}
        >
          Set codes
        </button>
      </div>

      {setInputMode === 'release' ? (
        <label className="ds-field">
          Set release
          <select
            id="ds-release"
            value={releaseId}
            onChange={(e) => {
              const next = e.target.value;
              onReleaseId(next);
              saveSettings({ ...settings, releaseId: next });
            }}
          >
            <option value="">Select a release…</option>
            <ReleaseSelectOptgroups releases={releases} />
          </select>
        </label>
      ) : (
        <label className="ds-field">
          Set codes (up to 5, comma-separated)
          <input
            type="text"
            id="ds-set-codes"
            value={setCodesInput}
            placeholder="LTR, LTC"
            onChange={(e) => onSetCodesInput(e.target.value)}
            onBlur={() => saveSettings({ ...settings, setCodes: setCodesInput })}
          />
        </label>
      )}

      {previewCodes.length ? (
        <p className="ds-meta" id="ds-resolved-codes">
          Sets:{' '}
          {previewCodes.map((code) => (
            <span key={code} className="ds-set-chip">
              {code}
            </span>
          ))}
        </p>
      ) : null}

      <h4 className="ds-meta">Decks</h4>
      {decksLoading ? <p className="ds-meta">Loading decks…</p> : null}
      {!decksLoading && !decks.length ? (
        <p className="ds-meta">No commander decks found. Save decks in Commander Builder first.</p>
      ) : null}

      {decks.length ? (
        <fieldset className="ds-deck-list">
          <legend>
            Decks ({selected.length}/{decks.length})
          </legend>
          <div className="ds-deck-select-actions">
            <button
              type="button"
              id="ds-select-all-decks"
              onClick={() =>
                onDeckSelectionChange({ ...deckSelection, selectedIds: selectAllDecks(decks) })
              }
            >
              Select all
            </button>
            <button
              type="button"
              id="ds-clear-all-decks"
              onClick={() => onDeckSelectionChange({ ...deckSelection, selectedIds: [] })}
            >
              Clear all
            </button>
          </div>
          {decks.map((deck) => (
            <label key={deck.deck_id} className="ds-deck-option">
              <input
                type="checkbox"
                name="ds-deck"
                value={deck.deck_id}
                checked={selected.indexOf(deck.deck_id) >= 0}
                onChange={(e) =>
                  onDeckSelectionChange({
                    ...deckSelection,
                    selectedIds: toggleDeckSelection(selected, deck.deck_id, e.target.checked),
                  })
                }
              />{' '}
              {deckSuggestHeaderText(deck)}
            </label>
          ))}
        </fieldset>
      ) : null}

      {isLocalHub() ? (
        <fieldset className="ds-rules-debug-setup">
          <legend>Developer</legend>
          <label className="ds-deck-option">
            <input
              type="checkbox"
              id="ds-rules-debug"
              checked={!!settings.rulesDebug}
              onChange={(e) => saveSettings({ ...settings, rulesDebug: e.target.checked })}
            />{' '}
            Debug trace
          </label>
        </fieldset>
      ) : null}
    </>
  );
}
