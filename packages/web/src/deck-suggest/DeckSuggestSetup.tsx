import { FOCUS_TAGS_MAX } from '@rayenz-hub/shared';
import { useEffect, useState } from 'react';
import { isLocalHub } from '../lib/hub-utils';
import { readProfileForDeck } from './data';
import { applyDeckList, selectAllDecks, toggleDeckSelection } from './deck-load';
import { deckSuggestHeaderText } from './display';
import { findReleaseEntry, formatSetCodesPreview, listReleaseOptions } from './releases';
import { ReleaseSelectOptgroups } from './ReleaseSelectOptgroups';
import { profileReadiness, profileReadinessLabel } from './profile-readiness';
import type { DeckProfile, DeckSelection, DeckSuggestSettings, SetInputMode } from './types';

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
  budgetUsdInput: string;
  onBudgetUsdInput: (value: string) => void;
  focusTags: string[];
  onFocusTags: (tags: string[]) => void;
  focusTagInput: string;
  onFocusTagInput: (value: string) => void;
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
  budgetUsdInput,
  onBudgetUsdInput,
  focusTags,
  onFocusTags,
  focusTagInput,
  onFocusTagInput,
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
  const setPreview = formatSetCodesPreview(selectedRelease, previewCodes);
  const budgetMode = setInputMode === 'budget';
  const selectedDeckId = budgetMode && selected.length ? selected[0] : '';
  const [profileLevel, setProfileLevel] = useState<'none' | 'partial' | 'ready'>('none');
  const [profileTagChips, setProfileTagChips] = useState<string[]>([]);

  useEffect(() => {
    if (!budgetMode || !selectedDeckId) {
      setProfileLevel('none');
      setProfileTagChips([]);
      return;
    }
    let cancelled = false;
    void readProfileForDeck(selectedDeckId)
      .then((profile: DeckProfile | null) => {
        if (cancelled) return;
        setProfileLevel(profileReadiness(profile));
        const chips = new Set<string>();
        (profile?.profile_tags || []).forEach((t) => chips.add(t));
        (profile?.themes || []).forEach((t) => chips.add(t));
        setProfileTagChips([...chips].sort());
      })
      .catch(() => {
        if (!cancelled) {
          setProfileLevel('none');
          setProfileTagChips([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [budgetMode, selectedDeckId]);

  function saveSettings(next: DeckSuggestSettings) {
    setSettings(next);
  }

  function switchMode(mode: SetInputMode) {
    onSetInputMode(mode);
    if (mode === 'budget' && selected.length > 1) {
      onDeckSelectionChange({
        ...deckSelection,
        selectedIds: selected.slice(0, 1),
      });
    }
  }

  function addFocusTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    if (focusTags.some((t) => t.toLowerCase() === tag)) return;
    if (focusTags.length >= FOCUS_TAGS_MAX) return;
    onFocusTags([...focusTags, tag]);
    onFocusTagInput('');
  }

  return (
    <>
      <h3>Setup</h3>
      <p className="ds-meta">Pick a source, choose decks, then Generate.</p>

      <div className="ds-set-mode-tabs" role="tablist" aria-label="Suggest input mode">
        <button
          type="button"
          role="tab"
          className={'ds-deck-load-tab' + (setInputMode === 'release' ? ' active' : '')}
          aria-selected={setInputMode === 'release'}
          id="ds-mode-release"
          onClick={() => switchMode('release')}
        >
          Set release
        </button>
        <button
          type="button"
          role="tab"
          className={'ds-deck-load-tab' + (setInputMode === 'codes' ? ' active' : '')}
          aria-selected={setInputMode === 'codes'}
          id="ds-mode-codes"
          onClick={() => switchMode('codes')}
        >
          Set codes
        </button>
        <button
          type="button"
          role="tab"
          className={'ds-deck-load-tab' + (budgetMode ? ' active' : '')}
          aria-selected={budgetMode}
          id="ds-mode-budget"
          onClick={() => switchMode('budget')}
        >
          Budget upgrade
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
      ) : null}

      {setInputMode === 'codes' ? (
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
      ) : null}

      {budgetMode ? (
        <>
          <label className="ds-field">
            Budget (USD)
            <input
              type="number"
              id="ds-budget-usd"
              min="1"
              step="1"
              value={budgetUsdInput}
              placeholder="25"
              onChange={(e) => onBudgetUsdInput(e.target.value)}
              onBlur={() => {
                const n = Number.parseFloat(budgetUsdInput);
                if (Number.isFinite(n) && n > 0) {
                  saveSettings({ ...settings, budgetUsd: n });
                }
              }}
            />
          </label>
          <p className="ds-meta" id="ds-profile-readiness">
            Profile readiness: {profileReadinessLabel(profileLevel)}
            {selectedDeckId ? (
              <>
                {' · '}
                <a href={`#/profile-builder?deckId=${encodeURIComponent(selectedDeckId)}`}>
                  Build profile
                </a>
              </>
            ) : null}
          </p>
        </>
      ) : null}

      {!budgetMode && previewCodes.length ? (
        <p className="ds-meta" id="ds-resolved-codes">
          Sets:{' '}
          {setPreview.summary ? (
            <span className="ds-set-chip">{setPreview.summary}</span>
          ) : (
            setPreview.chips.map((code) => (
              <span key={code} className="ds-set-chip">
                {code}
              </span>
            ))
          )}
        </p>
      ) : null}

      <fieldset className="ds-focus-run">
        <legend>Focus this run (optional, ≤{FOCUS_TAGS_MAX})</legend>
        <div className="ds-focus-chips">
          {focusTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="ds-focus-chip"
              onClick={() => onFocusTags(focusTags.filter((t) => t !== tag))}
            >
              {tag} ×
            </button>
          ))}
        </div>
        {profileTagChips.length ? (
          <div className="ds-focus-suggestions">
            {profileTagChips
              .filter((t) => !focusTags.some((f) => f.toLowerCase() === t.toLowerCase()))
              .slice(0, 12)
              .map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="ds-btn ds-btn-sm"
                  disabled={focusTags.length >= FOCUS_TAGS_MAX}
                  onClick={() => addFocusTag(tag)}
                >
                  + {tag}
                </button>
              ))}
          </div>
        ) : null}
        <label className="ds-field">
          Add focus tag
          <input
            type="text"
            id="ds-focus-input"
            value={focusTagInput}
            placeholder="mana-production"
            onChange={(e) => onFocusTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFocusTag(focusTagInput);
              }
            }}
          />
        </label>
        {focusTags.length ? (
          <button type="button" className="ds-btn ds-btn-sm" onClick={() => onFocusTags([])}>
            Clear focus
          </button>
        ) : null}
      </fieldset>

      <h4 className="ds-meta">Decks</h4>
      {decksLoading ? <p className="ds-meta">Loading decks…</p> : null}
      {!decksLoading && !decks.length ? (
        <p className="ds-meta">No commander decks found. Save decks in Commander Builder first.</p>
      ) : null}

      {decks.length ? (
        <fieldset className="ds-deck-list">
          <legend>
            Decks ({budgetMode ? (selected.length ? '1' : '0') : selected.length}/{decks.length})
          </legend>
          {!budgetMode ? (
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
          ) : null}
          {decks.map((deck) => (
            <label key={deck.deck_id} className="ds-deck-option">
              <input
                type={budgetMode ? 'radio' : 'checkbox'}
                name="ds-deck"
                value={deck.deck_id}
                checked={selected.indexOf(deck.deck_id) >= 0}
                onChange={(e) => {
                  if (budgetMode) {
                    onDeckSelectionChange({
                      ...deckSelection,
                      selectedIds: e.target.checked ? [deck.deck_id] : [],
                    });
                    return;
                  }
                  onDeckSelectionChange({
                    ...deckSelection,
                    selectedIds: toggleDeckSelection(selected, deck.deck_id, e.target.checked),
                  });
                }}
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
