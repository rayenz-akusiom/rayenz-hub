import type { DeckSummary } from '@rayenz-hub/shared';
import type { ReactNode } from 'react';
import { FormatBadge } from '../ui/FormatBadge';
import { LibraryCoverArt } from './LibraryCoverArt';
import { LibrarySkeleton } from './library-chrome';

export function toggleLibraryDeckSelection(
  selectedIds: string[],
  deckId: string,
  checked: boolean,
  mode: 'multi' | 'single' = 'multi',
): string[] {
  if (mode === 'single') {
    return checked ? [deckId] : [];
  }
  if (checked) {
    return selectedIds.indexOf(deckId) >= 0 ? selectedIds : selectedIds.concat(deckId);
  }
  return selectedIds.filter((id) => id !== deckId);
}

export function SelectableLibraryGrid({
  decks,
  selectedIds,
  onChange,
  mode = 'multi',
  loading = false,
  empty = null,
  ariaLabel = 'Decks',
  showSelectActions = true,
  selectActionsIdPrefix,
  footerForDeck,
}: {
  decks: DeckSummary[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  mode?: 'multi' | 'single';
  loading?: boolean;
  empty?: ReactNode;
  ariaLabel?: string;
  showSelectActions?: boolean;
  /** Prefix for Select all / Clear button ids (e.g. `ds` → `ds-select-all-decks`). */
  selectActionsIdPrefix?: string;
  footerForDeck?: (deck: DeckSummary, selected: boolean) => ReactNode;
}) {
  const selected = selectedIds || [];
  const multi = mode === 'multi';

  function selectDeck(deckId: string, checked: boolean) {
    onChange(toggleLibraryDeckSelection(selected, deckId, checked, mode));
  }

  return (
    <div className="db-selectable-library">
      {decks.length && multi && showSelectActions ? (
        <div className="db-selectable-library-actions">
          <span className="hub-muted">
            Decks ({selected.length}/{decks.length})
          </span>
          <button
            type="button"
            id={selectActionsIdPrefix ? `${selectActionsIdPrefix}-select-all-decks` : undefined}
            className="db-btn"
            onClick={() => onChange(decks.map((d) => d.deckId))}
          >
            Select all
          </button>
          <button
            type="button"
            id={selectActionsIdPrefix ? `${selectActionsIdPrefix}-clear-all-decks` : undefined}
            className="db-btn"
            onClick={() => onChange([])}
          >
            Clear all
          </button>
        </div>
      ) : decks.length && !multi ? (
        <p className="hub-muted">Choose one deck</p>
      ) : null}

      {loading ? <LibrarySkeleton /> : null}
      {!loading && !decks.length ? empty : null}

      {!loading && decks.length ? (
        <ul
          className="db-library-grid"
          role={multi ? 'group' : 'radiogroup'}
          aria-label={ariaLabel}
        >
          {decks.map((deck) => {
            const isOn = selected.indexOf(deck.deckId) >= 0;
            const dual = Boolean(deck.coverImageUrl && deck.coverImageUrlSecondary);
            const badgeFormat =
              deck.format === 'pendragon' || deck.format === 'cube' || deck.format === 'collection'
                ? deck.format
                : 'commander';
            return (
              <li
                key={deck.deckId}
                className={
                  'db-library-tile' +
                  (dual ? ' is-partner-pair' : '') +
                  (isOn ? ' is-selected' : '') +
                  (deck.coverPartnerStatus === 'illegal' ? ' is-illegal-pair' : '')
                }
              >
                <button
                  type="button"
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={isOn}
                  aria-label={deck.name}
                  className="db-library-tile-open"
                  onClick={() => selectDeck(deck.deckId, !isOn)}
                >
                  <LibraryCoverArt deck={deck} />
                  <span className="db-library-tile-caption">
                    <FormatBadge format={badgeFormat} />
                    <span className="db-library-tile-name">{deck.name}</span>
                  </span>
                </button>
                {footerForDeck ? footerForDeck(deck, isOn) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
