import { useEffect } from 'react';
import type { DeckEntry, ProfileLozenge, Suggestion } from '@rayenz-hub/shared';
import type { ProfileLozengeUpdates } from '@rayenz-hub/shared';
import { currentSuggestion, allVisibleSuggestions, pendingSuggestions } from './review';
import { PendingFilmstrip } from './PendingFilmstrip';
import { SuggestionCard } from './SuggestionCard';
import type { DeckReviewState, ReviewDecision } from './types';

type DeckReviewSuggestionPanelProps = {
  deck: DeckEntry | null;
  state: DeckReviewState;
  onDecision: (suggestionId: string, decision: ReviewDecision, advance: boolean) => void;
  onProfileUpdate: (patch: Partial<Pick<DeckReviewState, 'deckPrefs' | 'profilesConnected' | 'profileStatus'>>) => void;
  onError: (message: string) => void;
  onNavigateSuggestion: (delta: number) => void;
  onJumpSuggestion: (index: number) => void;
  onToggleLozenge?: (suggestionId: string, lozenges: ProfileLozenge[]) => void;
  onConfirmedProfileTags?: (suggestionId: string, updates: ProfileLozengeUpdates) => void;
};

export function DeckReviewSuggestionPanel({
  deck,
  state,
  onDecision,
  onProfileUpdate,
  onError,
  onNavigateSuggestion,
  onJumpSuggestion,
  onToggleLozenge,
  onConfirmedProfileTags,
}: DeckReviewSuggestionPanelProps) {
  const oneAtATime = !!deck && !state.showAllMode;

  useEffect(() => {
    if (!oneAtATime) {
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      if (document.querySelector('.hub-picker-dialog')) {
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'j') {
        e.preventDefault();
        onNavigateSuggestion(-1);
      } else if (key === 'k') {
        e.preventDefault();
        onNavigateSuggestion(1);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [oneAtATime, onNavigateSuggestion]);

  if (!deck) {
    return <div className="dr-empty">Select a deck.</div>;
  }

  const { progress, deckPrefs, showAllMode, profileStatus, suggestionIndex } = state;

  if (showAllMode) {
    const allSuggestions = allVisibleSuggestions(deck, deckPrefs);
    if (!allSuggestions.length) {
      return <div className="dr-empty">No suggestions for {deck.deck_name}.</div>;
    }
    return (
      <div className="dr-panel-main">
        {profileStatus ? <p className="dr-profile-status dr-profile-status-global">{profileStatus}</p> : null}
        <div className="dr-suggestions-all" id="dr-suggestions-all">
          {allSuggestions.map((s: Suggestion) => (
            <SuggestionCard
              key={String(s.suggestion_id)}
              deck={deck}
              suggestion={s}
              progress={progress}
              advanceOnAction={false}
              compact
              onDecision={onDecision}
              onProfileUpdate={onProfileUpdate}
              onError={onError}
              deckPrefs={deckPrefs}
              onToggleLozenge={onToggleLozenge}
              onConfirmedProfileTags={onConfirmedProfileTags}
            />
          ))}
        </div>
      </div>
    );
  }

  const suggestion = currentSuggestion(deck, progress, deckPrefs, suggestionIndex);
  if (!suggestion) {
    return <div className="dr-empty">All suggestions reviewed for {deck.deck_name}.</div>;
  }

  const pending = pendingSuggestions(deck, progress, deckPrefs);
  const safeIndex = Math.min(suggestionIndex, Math.max(pending.length - 1, 0));
  const progressLabel =
    pending.length > 0 ? `${safeIndex + 1} of ${pending.length} · ${deck.deck_name}` : deck.deck_name;
  const showFilmstrip = pending.length >= 2;

  return (
    <div className="dr-panel-main">
      {profileStatus ? <p className="dr-profile-status dr-profile-status-global">{profileStatus}</p> : null}
      <div className={'dr-one-at-a-time' + (showFilmstrip ? ' has-filmstrip' : '')}>
        {showFilmstrip ? (
          <PendingFilmstrip pending={pending} activeIndex={safeIndex} onJump={onJumpSuggestion} />
        ) : null}
        <SuggestionCard
          deck={deck}
          suggestion={suggestion}
          progress={progress}
          advanceOnAction={true}
          progressLabel={progressLabel}
          onDecision={onDecision}
          onProfileUpdate={onProfileUpdate}
          onError={onError}
          deckPrefs={deckPrefs}
          onToggleLozenge={onToggleLozenge}
          onConfirmedProfileTags={onConfirmedProfileTags}
        />
      </div>
    </div>
  );
}
