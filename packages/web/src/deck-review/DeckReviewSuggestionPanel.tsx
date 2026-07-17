import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import type { ReviewProgress } from '../lib/hub-storage';
import { currentSuggestion, allVisibleSuggestions } from './review';
import { DeckReviewStatusCard } from './DeckReviewStatusCard';
import { SuggestionCard } from './SuggestionCard';
import type { DeckPrefs, DeckReviewState, ReviewDecision, StatusCardTab, TransferSource } from './types';

type DeckReviewSuggestionPanelProps = {
  deck: DeckEntry | null;
  state: DeckReviewState;
  onToggleShowAll: () => void;
  onDecision: (suggestionId: string, decision: ReviewDecision, advance: boolean) => void;
  onProfileUpdate: (patch: Partial<Pick<DeckReviewState, 'deckPrefs' | 'profilesConnected' | 'profileStatus'>>) => void;
  onTabChange: (tab: StatusCardTab) => void;
  onRefreshDeck: () => void;
  onApplyStaged: (message: string) => void;
  onError: (message: string) => void;
};

function ViewToolbar({ deck, showAllMode, onToggle }: { deck: DeckEntry; showAllMode: boolean; onToggle: () => void }) {
  return (
    <div className="dr-view-toolbar">
      {deck.archidekt_url ? (
        <a className="dr-deck-archidekt-link" href={deck.archidekt_url} target="_blank" rel="noopener">
          Open {deck.deck_name} on Archidekt
        </a>
      ) : null}
      <button type="button" className="dr-btn dr-btn-ghost" id="dr-toggle-view" onClick={onToggle}>
        {showAllMode ? 'One at a time' : 'Show all'}
      </button>
    </div>
  );
}

export function DeckReviewSuggestionPanel({
  deck,
  state,
  onToggleShowAll,
  onDecision,
  onProfileUpdate,
  onTabChange,
  onRefreshDeck,
  onApplyStaged,
  onError,
}: DeckReviewSuggestionPanelProps) {
  if (!deck) {
    return <div className="dr-empty">Select a deck.</div>;
  }

  const { progress, deckPrefs, showAllMode, profileStatus, statusCardTab, transferSource } = state;

  const statusCard = (
    <DeckReviewStatusCard
      deck={deck}
      progress={progress}
      deckPrefs={deckPrefs}
      statusCardTab={statusCardTab}
      transferSource={transferSource}
      onTabChange={onTabChange}
      onRefreshDeck={onRefreshDeck}
      onApplyStaged={onApplyStaged}
      onError={onError}
    />
  );

  if (showAllMode) {
    const allSuggestions = allVisibleSuggestions(deck, deckPrefs);
    if (!allSuggestions.length) {
      return (
        <>
          {statusCard}
          <ViewToolbar deck={deck} showAllMode={showAllMode} onToggle={onToggleShowAll} />
          <div className="dr-empty">No suggestions for {deck.deck_name}.</div>
        </>
      );
    }
    return (
      <>
        {statusCard}
        <ViewToolbar deck={deck} showAllMode={showAllMode} onToggle={onToggleShowAll} />
        {profileStatus ? <p className="dr-profile-status dr-profile-status-global">{profileStatus}</p> : null}
        <div className="dr-suggestions-all" id="dr-suggestions-all">
          {allSuggestions.map((s: Suggestion) => (
            <SuggestionCard
              key={String(s.suggestion_id)}
              deck={deck}
              suggestion={s}
              progress={progress}
              advanceOnAction={false}
              onDecision={onDecision}
              onProfileUpdate={onProfileUpdate}
              deckPrefs={deckPrefs}
            />
          ))}
        </div>
      </>
    );
  }

  const suggestion = currentSuggestion(deck, progress, deckPrefs, state.suggestionIndex);
  if (!suggestion) {
    return (
      <>
        {statusCard}
        <ViewToolbar deck={deck} showAllMode={showAllMode} onToggle={onToggleShowAll} />
        <div className="dr-empty">All suggestions reviewed for {deck.deck_name}.</div>
      </>
    );
  }

  return (
    <>
      {statusCard}
      <ViewToolbar deck={deck} showAllMode={showAllMode} onToggle={onToggleShowAll} />
      {profileStatus ? <p className="dr-profile-status dr-profile-status-global">{profileStatus}</p> : null}
      <SuggestionCard
        deck={deck}
        suggestion={suggestion}
        progress={progress}
        advanceOnAction={true}
        onDecision={onDecision}
        onProfileUpdate={onProfileUpdate}
        deckPrefs={deckPrefs}
      />
    </>
  );
}
