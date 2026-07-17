import type { CSSProperties } from 'react';
import type { DeckFormat, DeckSummary } from '@rayenz-hub/shared';
import { CARD_SIZE_PX } from '../card-size';
import { FormatBadge } from '../ui/FormatBadge';

function PartnerTie({ illegal }: { illegal?: boolean }) {
  return (
    <span
      className={`db-partner-tie${illegal ? ' is-illegal' : ''}`}
      aria-hidden="true"
      title={illegal ? 'These commanders can’t partner' : undefined}
    >
      <svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false">
        <path
          fill="currentColor"
          d="M7 12a4 4 0 0 1 4-4h2v2h-2a2 2 0 1 0 0 4h2v2h-2a4 4 0 0 1-4-4zm6-4h2a4 4 0 0 1 0 8h-2v-2h2a2 2 0 0 0 0-4h-2V8z"
        />
      </svg>
    </span>
  );
}

function LibraryCoverArt({ deck }: { deck: DeckSummary }) {
  const dual = Boolean(deck.coverImageUrl && deck.coverImageUrlSecondary);
  const illegal = deck.coverPartnerStatus === 'illegal';

  if (!deck.coverImageUrl) {
    return (
      <span className="db-library-tile-art" aria-hidden="true">
        <span className="db-library-tile-fallback">{deck.name}</span>
      </span>
    );
  }

  if (!dual) {
    return (
      <span className="db-library-tile-art" aria-hidden="true">
        <img src={deck.coverImageUrl} alt="" loading="lazy" />
      </span>
    );
  }

  return (
    <span
      className={`db-library-tile-art is-partner-pair${illegal ? ' is-illegal' : ''}`}
      aria-hidden="true"
    >
      <span className="db-library-tile-face">
        <img src={deck.coverImageUrl} alt="" loading="lazy" />
      </span>
      <PartnerTie illegal={illegal} />
      <span className="db-library-tile-face">
        <img src={deck.coverImageUrlSecondary!} alt="" loading="lazy" />
      </span>
    </span>
  );
}

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
          return (
            <li
              key={d.deckId}
              className={`db-library-tile${dual ? ' is-partner-pair' : ''}${
                d.coverPartnerStatus === 'illegal' ? ' is-illegal-pair' : ''
              }`}
            >
              <button
                type="button"
                className="db-library-tile-open"
                title={
                  d.coverPartnerStatus === 'illegal'
                    ? `${updated} — These commanders can’t partner`
                    : updated
                }
                onClick={() => onOpen(d.deckId)}
              >
                <LibraryCoverArt deck={d} />
                <span className="db-library-tile-caption">
                  <FormatBadge format={d.format} />
                  <span className="db-library-tile-name">{d.name}</span>
                </span>
              </button>
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
  const commanders = decks.filter((d) => d.format === 'commander');
  const cubes = decks.filter((d) => d.format === 'cube');
  const other = decks.filter((d) => d.format !== 'commander' && d.format !== 'cube');

  const libraryStyle = {
    ['--db-card-w']: `${CARD_SIZE_PX.M}px`,
  } as CSSProperties;

  return (
    <div className="db-library" style={libraryStyle}>
      <header className="db-header">
        <h2>Deck Builder</h2>
        <div className="db-header-actions">
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
      {loading ? <p className="db-meta">Loading…</p> : null}
      {!loading && !decks.length ? (
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
      ) : !loading ? (
        <div className="db-library-sections">
          <LibrarySection format="commander" decks={commanders} onOpen={onOpen} onDelete={onDelete} />
          <LibrarySection format="cube" decks={cubes} onOpen={onOpen} onDelete={onDelete} />
          <LibrarySection format="other" decks={other} onOpen={onOpen} onDelete={onDelete} />
        </div>
      ) : null}
    </div>
  );
}
