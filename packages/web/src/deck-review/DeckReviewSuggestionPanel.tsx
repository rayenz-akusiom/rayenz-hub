import { useEffect, type ReactNode } from 'react';
import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { currentSuggestion, allVisibleSuggestions, pendingSuggestions } from './review';
import { DeckReviewStatusCard } from './DeckReviewStatusCard';
import { SuggestionCard } from './SuggestionCard';
import type { DeckReviewState, ReviewDecision, StatusCardTab } from './types';

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
  onNavigateSuggestion: (delta: number) => void;
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

function PanelShell({
  statusCard,
  children,
}: {
  statusCard: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="dr-panel-layout">
      <aside className="dr-panel-status">{statusCard}</aside>
      <div className="dr-panel-main">{children}</div>
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
  onNavigateSuggestion,
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

  const { progress, deckPrefs, showAllMode, profileStatus, statusCardTab, transferSource, suggestionIndex } = state;

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
        <PanelShell statusCard={statusCard}>
          <ViewToolbar deck={deck} showAllMode={showAllMode} onToggle={onToggleShowAll} />
          <div className="dr-empty">No suggestions for {deck.deck_name}.</div>
        </PanelShell>
      );
    }
    return (
      <PanelShell statusCard={statusCard}>
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
              compact
              onDecision={onDecision}
              onProfileUpdate={onProfileUpdate}
              deckPrefs={deckPrefs}
            />
          ))}
        </div>
      </PanelShell>
    );
  }

  const suggestion = currentSuggestion(deck, progress, deckPrefs, suggestionIndex);
  if (!suggestion) {
    return (
      <PanelShell statusCard={statusCard}>
        <ViewToolbar deck={deck} showAllMode={showAllMode} onToggle={onToggleShowAll} />
        <div className="dr-empty">All suggestions reviewed for {deck.deck_name}.</div>
      </PanelShell>
    );
  }

  const pending = pendingSuggestions(deck, progress, deckPrefs);
  const safeIndex = Math.min(suggestionIndex, Math.max(pending.length - 1, 0));
  const progressLabel =
    pending.length > 0 ? `${safeIndex + 1} of ${pending.length} · ${deck.deck_name}` : deck.deck_name;

  return (
    <PanelShell statusCard={statusCard}>
      <ViewToolbar deck={deck} showAllMode={showAllMode} onToggle={onToggleShowAll} />
      {profileStatus ? <p className="dr-profile-status dr-profile-status-global">{profileStatus}</p> : null}
      <SuggestionCard
        deck={deck}
        suggestion={suggestion}
        progress={progress}
        advanceOnAction={true}
        progressLabel={progressLabel}
        onDecision={onDecision}
        onProfileUpdate={onProfileUpdate}
        deckPrefs={deckPrefs}
      />
    </PanelShell>
  );
}
