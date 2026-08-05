import { useMemo, useState, type CSSProperties } from 'react';
import type { DeckFormat, DeckSummary } from '@rayenz-hub/shared';
import { deckBuilderHash, HUB_USER_SLUG } from '../../hub/routes';
import { toKebabCase } from '../../lib/string-utils';
import { CARD_SIZE_PX } from '../card-size';
import { FormatBadge } from '../ui/FormatBadge';
import { LibraryCoverArt } from './LibraryCoverArt';
import { LibrarySkeleton, LibrarySortSelect } from './library-chrome';
import {
  persistLibrarySort,
  readLibrarySort,
  sortLibraryDecks,
  type LibrarySort,
} from './library-sort';

export {
  LIBRARY_SORT_KEY,
  readLibrarySort,
  sortLibraryDecks,
  type LibrarySort,
} from './library-sort';

function LibrarySection({
  format,
  decks,
  onOpen,
  onDelete,
}: {
  format: DeckFormat;
  decks: DeckSummary[];
  onOpen: (deckId: string) => void;
  onDelete: (deckId: string) => void;
}) {
  if (!decks.length) return null;
  const label =
    format === 'commander' ? 'Commander' : format === 'cube' ? 'Cube' : 'Other';

  return (
    <section className="db-library-section" aria-label={label}>
      <h3 className="db-library-section-title">
        <FormatBadge format={format} showLabel />
      </h3>
      <ul className="db-library-grid">
        {decks.map((d) => {
          const updated = `Updated ${new Date(d.updatedAt).toLocaleString()}`;
          const dual = Boolean(d.coverImageUrl && d.coverImageUrlSecondary);
          const href = deckBuilderHash(HUB_USER_SLUG, toKebabCase(d.name));
          return (
            <li
              key={d.deckId}
              className={`db-library-tile${dual ? ' is-partner-pair' : ''}${
                d.coverPartnerStatus === 'illegal' ? ' is-illegal-pair' : ''
              }`}
            >
              <a
                href={href}
                className="db-library-tile-open"
                title={
                  d.coverPartnerStatus === 'illegal'
                    ? `${updated} — These commanders can’t partner`
                    : updated
                }
                onClick={(e) => {
                  e.preventDefault();
                  onOpen(d.deckId);
                }}
              >
                <LibraryCoverArt deck={d} />
                <span className="db-library-tile-caption">
                  <FormatBadge format={d.format} />
                  <span className="db-library-tile-name">{d.name}</span>
                </span>
              </a>
              <button
                type="button"
                className="db-library-tile-delete"
                aria-label={`Delete ${d.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Remove "${d.name}" from Hub library?`)) {
                    onDelete(d.deckId);
                  }
                }}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Multi-format library shell (tests + shared chrome). Production builders use FormatFilteredLibrary. */
export function LibraryView({
  decks,
  loading,
  error,
  onOpen,
  onAdd,
  onDelete,
  onRefreshRemote,
}: {
  decks: DeckSummary[];
  loading?: boolean;
  error?: string | null;
  onOpen: (deckId: string) => void;
  onAdd: () => void;
  onDelete: (deckId: string) => void;
  onRefreshRemote?: () => void;
}) {
  const [sort, setSort] = useState<LibrarySort>(() => readLibrarySort());

  const sorted = useMemo(() => sortLibraryDecks(decks, sort), [decks, sort]);
  const commanders = sorted.filter((d) => d.format === 'commander');
  const cubes = sorted.filter((d) => d.format === 'cube');
  const other = sorted.filter((d) => d.format !== 'commander' && d.format !== 'cube');

  function onSortChange(next: LibrarySort) {
    setSort(next);
    persistLibrarySort(next);
  }

  const libraryStyle = {
    ['--db-card-w']: `${CARD_SIZE_PX.M}px`,
  } as CSSProperties;

  return (
    <div className="db-library" style={libraryStyle}>
      <header className="db-header">
        <h2>Deck Builder</h2>
        <div className="db-header-actions">
          <LibrarySortSelect sort={sort} onChange={onSortChange} />
          {onRefreshRemote ? (
            <button type="button" className="db-btn" onClick={onRefreshRemote}>
              Sync from API
            </button>
          ) : null}
          <button type="button" className="db-btn is-active" onClick={onAdd}>
            Add deck
          </button>
        </div>
      </header>
      {error ? <p className="db-error">{error}</p> : null}
      {loading ? (
        <LibrarySkeleton />
      ) : !decks.length ? (
        <div className="db-empty-state">
          <p>No Hub-saved decks yet.</p>
          <p>
            Add a deck by pasting an Archidekt import, or refresh from Archidekt when the bridge is
            available.
          </p>
          <button type="button" className="db-btn is-active" onClick={onAdd}>
            Add deck
          </button>
        </div>
      ) : (
        <div className="db-library-sections">
          <LibrarySection format="commander" decks={commanders} onOpen={onOpen} onDelete={onDelete} />
          <LibrarySection format="cube" decks={cubes} onOpen={onOpen} onDelete={onDelete} />
          <LibrarySection format="other" decks={other} onOpen={onOpen} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
}
