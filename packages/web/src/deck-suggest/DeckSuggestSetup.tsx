import { FOCUS_TAGS_MAX, type DeckSummary } from '@rayenz-hub/shared';
import { useEffect, useState } from 'react';
import { LibraryCoverArt } from '../deck-builder/library/LibraryCoverArt';
import { LibrarySkeleton } from '../deck-builder/library/library-chrome';
import { FormatBadge } from '../deck-builder/ui/FormatBadge';
import { CARD_SIZE_PX } from '../deck-builder/card-size';
import { selectAllDecks, toggleDeckSelection } from './deck-load';
import { readProfileForDeck } from './data';
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
  covers: Record<string, DeckSummary>;
};

function coverSummary(deckId: string, name: string, covers: Record<string, DeckSummary>): DeckSummary {
  return (
    covers[deckId] || {
      deckId,
      name,
      format: 'commander',
      ownership: 'owned',
      visibility: 'public',
      updatedAt: '',
      archidektId: null,
      coverImageUrl: null,
      coverImageUrlSecondary: null,
      coverPartnerStatus: null,
      coverCardName: null,
    }
  );
}

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
  covers,
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
  const [focusOpen, setFocusOpen] = useState(false);

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

  function selectDeck(deckId: string, on: boolean) {
    if (budgetMode) {
      onDeckSelectionChange({
        ...deckSelection,
        selectedIds: on ? [deckId] : [],
      });
      return;
    }
    onDeckSelectionChange({
      ...deckSelection,
      selectedIds: toggleDeckSelection(selected, deckId, on),
    });
  }

  return (
    <div className="ds-setup-canvas" style={{ ['--db-card-w' as string]: `${CARD_SIZE_PX.M}px` }}>
      <div className="ds-setup-source">
        <div className="ds-set-mode-tabs" role="tablist" aria-label="Suggest input mode">
          <button
            type="button"
            role="tab"
            className={'ds-mode-chip' + (setInputMode === 'release' ? ' active' : '')}
            aria-selected={setInputMode === 'release'}
            id="ds-mode-release"
            onClick={() => switchMode('release')}
          >
            Set release
          </button>
          <button
            type="button"
            role="tab"
            className={'ds-mode-chip' + (setInputMode === 'codes' ? ' active' : '')}
            aria-selected={setInputMode === 'codes'}
            id="ds-mode-codes"
            onClick={() => switchMode('codes')}
          >
            Set codes
          </button>
          <button
            type="button"
            role="tab"
            className={'ds-mode-chip' + (budgetMode ? ' active' : '')}
            aria-selected={budgetMode}
            id="ds-mode-budget"
            onClick={() => switchMode('budget')}
          >
            Budget upgrade
          </button>
        </div>

        {setInputMode === 'release' ? (
          <label className="ds-field ds-setup-control">
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
          <label className="ds-field ds-setup-control">
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
          <label className="ds-field ds-setup-control">
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
        ) : null}

        {!budgetMode && previewCodes.length ? (
          <div className="ds-setup-chips" id="ds-resolved-codes">
            {setPreview.summary ? (
              <span className="db-filter-chip ds-set-chip">{setPreview.summary}</span>
            ) : (
              setPreview.chips.map((code) => (
                <span key={code} className="db-filter-chip ds-set-chip">
                  {code}
                </span>
              ))
            )}
          </div>
        ) : null}

        <div className="ds-focus-run">
          <div className="ds-setup-chips">
            {focusTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="db-filter-chip"
                onClick={() => onFocusTags(focusTags.filter((t) => t !== tag))}
              >
                {tag}
                <span className="db-filter-chip-x" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
            {focusTags.length ? (
              <button type="button" className="db-filter-chip db-filter-chip-clear" onClick={() => onFocusTags([])}>
                Clear focus
              </button>
            ) : null}
            {!focusOpen ? (
              <button
                type="button"
                className="db-filter-chip db-filter-chip-clear"
                disabled={focusTags.length >= FOCUS_TAGS_MAX}
                onClick={() => setFocusOpen(true)}
              >
                Focus this run…
              </button>
            ) : null}
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
                    className="db-filter-chip"
                    disabled={focusTags.length >= FOCUS_TAGS_MAX}
                    onClick={() => addFocusTag(tag)}
                  >
                    + {tag}
                  </button>
                ))}
            </div>
          ) : null}
          {focusOpen ? (
            <label className="ds-field ds-setup-control">
              Add focus tag (optional, ≤{FOCUS_TAGS_MAX})
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
          ) : null}
        </div>
      </div>

      <div className="ds-setup-decks">
        {decks.length && !budgetMode ? (
          <div className="ds-deck-select-actions">
            <span className="ds-meta">
              Decks ({selected.length}/{decks.length})
            </span>
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
        ) : decks.length ? (
          <p className="ds-meta">Choose one deck</p>
        ) : null}

        {decksLoading ? <LibrarySkeleton /> : null}
        {!decksLoading && !decks.length ? (
          <div className="db-empty-state">
            <p>No commander decks in the library.</p>
            <p>Save a deck in Commander Builder, then generate suggestions here.</p>
            <a href="#/commander-builder" className="db-btn is-active">
              Open Commander Builder
            </a>
          </div>
        ) : null}

        {!decksLoading && decks.length ? (
          <ul className="db-library-grid" role={budgetMode ? 'radiogroup' : 'group'} aria-label="Decks">
            {decks.map((deck) => {
              const isOn = selected.indexOf(deck.deck_id) >= 0;
              const summary = coverSummary(deck.deck_id, deck.deck_name, covers);
              const dual = Boolean(summary.coverImageUrl && summary.coverImageUrlSecondary);
              return (
                <li
                  key={deck.deck_id}
                  className={
                    'db-library-tile' +
                    (dual ? ' is-partner-pair' : '') +
                    (isOn ? ' is-selected' : '') +
                    (summary.coverPartnerStatus === 'illegal' ? ' is-illegal-pair' : '')
                  }
                >
                  <button
                    type="button"
                    role={budgetMode ? 'radio' : 'checkbox'}
                    aria-checked={isOn}
                    aria-label={deck.deck_name}
                    className="db-library-tile-open"
                    onClick={() => selectDeck(deck.deck_id, !isOn)}
                  >
                    <LibraryCoverArt deck={summary} />
                    <span className="db-library-tile-caption">
                      <FormatBadge format={summary.format === 'pendragon' ? 'pendragon' : 'commander'} />
                      <span className="db-library-tile-name">{deck.deck_name}</span>
                    </span>
                  </button>
                  {budgetMode && isOn ? (
                    <p className="ds-tile-profile" id="ds-profile-readiness">
                      {profileReadinessLabel(profileLevel)}
                      {' · '}
                      <a href={`#/profile-builder?deckId=${encodeURIComponent(deck.deck_id)}`}>
                        Build profile
                      </a>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
