import { useEffect, useRef, type ReactNode } from 'react';
import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { scryfallImageFromId, scryfallImageFromName, scryfallImageFromPrinting } from '../lib/hub-utils';
import { currentSuggestion, allVisibleSuggestions, pendingSuggestions } from './review';
import { DeckReviewStatusCard } from './DeckReviewStatusCard';
import { SuggestionCard } from './SuggestionCard';
import type { DeckReviewState, ReviewDecision, StatusCardTab } from './types';

type DeckReviewSuggestionPanelProps = {
  deck: DeckEntry | null;
  state: DeckReviewState;
  onDecision: (suggestionId: string, decision: ReviewDecision, advance: boolean) => void;
  onProfileUpdate: (patch: Partial<Pick<DeckReviewState, 'deckPrefs' | 'profilesConnected' | 'profileStatus'>>) => void;
  onTabChange: (tab: StatusCardTab) => void;
  onApplyStaged: (message: string) => void;
  onError: (message: string) => void;
  onNavigateSuggestion: (delta: number) => void;
  onJumpSuggestion: (index: number) => void;
};

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

function suggestionInThumb(suggestion: Suggestion): string {
  const card = suggestion.card as {
    scryfall_id?: string;
    set_code?: string;
    collector_number?: string;
    name?: string;
  };
  if (card.scryfall_id) {
    return scryfallImageFromId(card.scryfall_id);
  }
  if (card.set_code && card.collector_number) {
    return scryfallImageFromPrinting(card.set_code, card.collector_number);
  }
  return scryfallImageFromName(card.name);
}

function suggestionOutThumb(suggestion: Suggestion): string {
  const rep = (suggestion.replaces || [])[0] as
    | { name?: string; set_code?: string; collector_number?: string; scryfall_id?: string }
    | undefined;
  if (!rep?.name) {
    return '';
  }
  if (rep.scryfall_id) {
    return scryfallImageFromId(rep.scryfall_id);
  }
  if (rep.set_code && rep.collector_number) {
    return scryfallImageFromPrinting(rep.set_code, rep.collector_number);
  }
  return scryfallImageFromName(rep.name);
}

function PendingFilmstrip({
  pending,
  activeIndex,
  onJump,
}: {
  pending: Suggestion[];
  activeIndex: number;
  onJump: (index: number) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) {
      return;
    }
    const active = strip.querySelector('.dr-filmstrip-item.is-active') as HTMLElement | null;
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [activeIndex, pending.length]);

  if (pending.length < 2) {
    return null;
  }

  return (
    <div className="dr-filmstrip" aria-label="Pending suggestions">
      <div className="dr-filmstrip-track" ref={stripRef}>
        {pending.map((s, i) => {
          const card = s.card as { name?: string };
          const inSrc = suggestionInThumb(s);
          const outSrc = suggestionOutThumb(s);
          const label = (card.name || 'Suggestion') + (outSrc ? ' → cut' : '');
          return (
            <button
              key={String(s.suggestion_id)}
              type="button"
              className={'dr-filmstrip-item' + (i === activeIndex ? ' is-active' : '')}
              aria-current={i === activeIndex ? 'true' : undefined}
              aria-label={`Suggestion ${i + 1}: ${label}`}
              title={label}
              onClick={() => onJump(i)}
            >
              <span className="dr-filmstrip-pair">
                {inSrc ? <img src={inSrc} alt="" /> : <span className="dr-filmstrip-empty" />}
                <span className="dr-filmstrip-arrow" aria-hidden="true">
                  →
                </span>
                {outSrc ? <img src={outSrc} alt="" /> : <span className="dr-filmstrip-empty" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DeckReviewSuggestionPanel({
  deck,
  state,
  onDecision,
  onProfileUpdate,
  onTabChange,
  onApplyStaged,
  onError,
  onNavigateSuggestion,
  onJumpSuggestion,
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
      onApplyStaged={onApplyStaged}
      onError={onError}
    />
  );

  if (showAllMode) {
    const allSuggestions = allVisibleSuggestions(deck, deckPrefs);
    if (!allSuggestions.length) {
      return (
        <PanelShell statusCard={statusCard}>
          <div className="dr-empty">No suggestions for {deck.deck_name}.</div>
        </PanelShell>
      );
    }
    return (
      <PanelShell statusCard={statusCard}>
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
      {profileStatus ? <p className="dr-profile-status dr-profile-status-global">{profileStatus}</p> : null}
      <PendingFilmstrip pending={pending} activeIndex={safeIndex} onJump={onJumpSuggestion} />
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
      />
    </PanelShell>
  );
}
