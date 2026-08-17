import { useState } from 'react';
import type { DeckEntry } from '@rayenz-hub/shared';
import { DeckProfilePanel } from '../deck-builder/profile/DeckProfilePanel';
import type { ReviewProgress } from '../lib/hub-storage';
import { ArchidektExport } from '../mtg/archidekt-export';
import { deckProgressCounts, deckSuggestionCount, sortDecksByName } from './review';
import type { DeckReviewState } from './types';

type DeckReviewSidebarProps = {
  state: DeckReviewState;
  navOpen: boolean;
  onCloseNav: () => void;
  onSelectDeck: (deckId: string) => void;
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

function profileDeckRef(deck: DeckEntry | null): { deckId: string; archidektId: number | null } | null {
  if (!deck?.deck_id) return null;
  return {
    deckId: deck.deck_id,
    archidektId: ArchidektExport.parseDeckId(deck.archidekt_url),
  };
}

export function DeckReviewSidebar({ state, navOpen, onCloseNav, onSelectDeck }: DeckReviewSidebarProps) {
  const { data, activeDeckId, progress } = state;
  const [asideTab, setAsideTab] = useState<'deck' | 'profile'>('deck');
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
  const profileRef = profileDeckRef(activeDeck);

  return (
    <aside id="dr-right-nav" className={'dr-right-nav' + (navOpen ? ' open' : '')} aria-label="Deck navigation">
      <div className="db-aside-tabs" role="tablist" aria-label="Deck side panel">
        <button
          type="button"
          role="tab"
          id="dr-aside-tab-deck"
          aria-selected={asideTab === 'deck'}
          aria-controls="dr-aside-panel-deck"
          className={`db-aside-tab${asideTab === 'deck' ? ' is-active' : ''}`}
          onClick={() => setAsideTab('deck')}
        >
          Deck
        </button>
        <button
          type="button"
          role="tab"
          id="dr-aside-tab-profile"
          aria-selected={asideTab === 'profile'}
          aria-controls="dr-aside-panel-profile"
          className={`db-aside-tab${asideTab === 'profile' ? ' is-active' : ''}`}
          onClick={() => setAsideTab('profile')}
        >
          Profile
        </button>
      </div>

      <div
        role="tabpanel"
        id="dr-aside-panel-deck"
        aria-labelledby="dr-aside-tab-deck"
        className="db-aside-panel"
        hidden={asideTab !== 'deck'}
      >
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
            {!data ? (
              <p className="dr-meta">Generate or upload suggestions to review decks here.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div
        role="tabpanel"
        id="dr-aside-panel-profile"
        aria-labelledby="dr-aside-tab-profile"
        className="db-aside-panel"
        hidden={asideTab !== 'profile'}
      >
        {asideTab === 'profile' ? (
          profileRef ? (
            <DeckProfilePanel deck={profileRef} />
          ) : (
            <section className="db-profile" aria-label="Deck profile">
              <h3 className="db-profile-title">Profile</h3>
              <p className="db-muted">Generate or upload suggestions, then select a deck to view its profile.</p>
            </section>
          )
        ) : null}
      </div>
    </aside>
  );
}
