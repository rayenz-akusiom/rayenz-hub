import type { DeckEntry } from '@rayenz-hub/shared';
import type { ReviewProgress } from '../lib/hub-storage';
import { deckProgressCounts, deckSuggestionCount, sortDecksByName } from './review';
import {
  canConnectProfilesFolder,
  canWriteProfiles,
  prefCountsLabel,
} from './profiles';
import type { DeckReviewState } from './types';

type DeckReviewSidebarProps = {
  state: DeckReviewState;
  navOpen: boolean;
  bridgeOk: boolean;
  onCloseNav: () => void;
  onFetchLatest: () => void;
  onUploadClick: () => void;
  onFileChange: (file: File) => void;
  onDownloadJson: () => void;
  onConnectProfiles: () => void;
  onRefreshAllDecks: () => void;
  onSelectDeck: (deckId: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

function DeckChip({
  deck,
  activeDeckId,
  progress,
  onSelect,
}: {
  deck: DeckEntry;
  activeDeckId: string | null;
  progress: ReviewProgress;
  onSelect: (deckId: string) => void;
}) {
  const counts = deckProgressCounts(deck, progress);
  let cls = 'hub-deck-chip';
  if (deck.deck_id === activeDeckId) cls += ' active';
  if (counts.reviewed >= counts.total && counts.total > 0) cls += ' done';
  if (!deckSuggestionCount(deck)) cls += ' empty';
  return (
    <button type="button" className={cls} data-deck-id={deck.deck_id} onClick={() => onSelect(deck.deck_id || '')}>
      {deck.deck_name}
      <span className="hub-deck-chip-count">
        {counts.accepted}/{counts.total}
      </span>
    </button>
  );
}

export function DeckReviewSidebar({
  state,
  navOpen,
  bridgeOk,
  onCloseNav,
  onFetchLatest,
  onUploadClick,
  onFileChange,
  onDownloadJson,
  onConnectProfiles,
  onRefreshAllDecks,
  onSelectDeck,
  fileInputRef,
}: DeckReviewSidebarProps) {
  const { data, activeDeckId, progress, transferSource, profilesConnected } = state;
  const decks = data?.decks || [];
  const withSuggestions: DeckEntry[] = [];
  const withoutSuggestions: DeckEntry[] = [];
  decks.forEach((deck) => {
    if (deckSuggestionCount(deck) > 0) {
      withSuggestions.push(deck);
    } else {
      withoutSuggestions.push(deck);
    }
  });

  const activeDeck = decks.find((d) => d.deck_id === activeDeckId) || null;
  const canConnect = canConnectProfilesFolder();
  const canWrite = canWriteProfiles();
  const refreshLabel =
    transferSource === 'deck-suggest' ? 'Refresh from Archidekt (optional)' : 'Refresh all decks';
  const refreshTitle =
    transferSource === 'deck-suggest'
      ? bridgeOk
        ? 'Snapshots loaded from Deck Suggest; refresh only if Archidekt changed since.'
        : 'Requires Archidekt Deck Review Bridge userscript'
      : bridgeOk
        ? 'Fetch latest deck lists from Archidekt'
        : 'Requires Archidekt Deck Review Bridge userscript';

  return (
      <aside id="dr-right-nav" className={'dr-right-nav' + (navOpen ? ' open' : '')} aria-label="Deck navigation">
        <div className="dr-nav-actions">
          <h3>Data</h3>
          <button type="button" className="dr-btn dr-btn-primary" id="dr-fetch-latest" onClick={onFetchLatest}>
            Refresh latest
          </button>
          <button type="button" className="dr-btn dr-btn-ghost" id="dr-upload-btn" onClick={onUploadClick}>
            Upload JSON
          </button>
          {transferSource === 'deck-suggest' ? (
            <button type="button" className="dr-btn dr-btn-ghost" id="dr-download-json" onClick={onDownloadJson}>
              Download JSON
            </button>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            id="dr-file-input"
            className="dr-file-input"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onFileChange(file);
              }
            }}
          />
        </div>

        {data ? (
          <div className="dr-profiles-section" id="dr-profiles-section">
            <h3>Profiles</h3>
            {!canWrite ? (
              <p className="dr-profiles-note" id="dr-tablet-profiles-note">
                Profile updates require desktop Chrome on PC.
              </p>
            ) : null}
            {canConnect ? (
              <button
                type="button"
                className="dr-btn dr-btn-ghost"
                id="dr-connect-profiles"
                disabled={profilesConnected}
                onClick={onConnectProfiles}
              >
                {profilesConnected ? 'Profiles folder connected' : 'Connect profiles folder'}
              </button>
            ) : null}
            {state.profileStatus ? (
              <div id="dr-profile-status" className="dr-profiles-status">
                {state.profileStatus}
              </div>
            ) : null}
            <div id="dr-pref-counts" className="dr-pref-counts">
              {prefCountsLabel(activeDeck, state.deckPrefs)}
            </div>
          </div>
        ) : null}

        <div className="dr-nav-actions">
          <h3>Archidekt</h3>
          <button
            type="button"
            className="dr-btn dr-btn-ghost"
            id="dr-refresh-all-decks"
            disabled={!bridgeOk}
            title={refreshTitle}
            onClick={onRefreshAllDecks}
          >
            {refreshLabel}
          </button>
        </div>

        <div>
          <h3>Decks</h3>
          <div className="hub-deck-list" id="dr-deck-list">
            {sortDecksByName(withSuggestions).map((deck) => (
              <DeckChip
                key={deck.deck_id}
                deck={deck}
                activeDeckId={activeDeckId}
                progress={progress}
                onSelect={(id) => {
                  onSelectDeck(id);
                  onCloseNav();
                }}
              />
            ))}
            {withoutSuggestions.length ? (
              <details
                className="dr-deck-empty-collapse"
                open={withoutSuggestions.some((d) => d.deck_id === activeDeckId)}
              >
                <summary>No suggestions ({withoutSuggestions.length})</summary>
                <div className="hub-deck-list">
                  {sortDecksByName(withoutSuggestions).map((deck) => (
                    <DeckChip
                      key={deck.deck_id}
                      deck={deck}
                      activeDeckId={activeDeckId}
                      progress={progress}
                      onSelect={(id) => {
                        onSelectDeck(id);
                        onCloseNav();
                      }}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </aside>
  );
}
