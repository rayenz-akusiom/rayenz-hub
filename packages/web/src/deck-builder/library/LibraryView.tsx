import { useMemo, useState, type CSSProperties } from 'react';
import type { DeckFormat, DeckSummary } from '@rayenz-hub/shared';
import { deckBuilderHash, HUB_USER_SLUG } from '../../hub/routes';
import { toKebabCase } from '../../lib/string-utils';
import { CARD_SIZE_PX } from '../card-size';
import { FormatBadge } from '../ui/FormatBadge';

export const LIBRARY_SORT_KEY = 'rayenz-deck-builder-library-sort';
export type LibrarySort = 'recent' | 'name' | 'cover';

export function readLibrarySort(): LibrarySort {
  try {
    const raw = localStorage.getItem(LIBRARY_SORT_KEY);
    if (raw === 'name' || raw === 'recent' || raw === 'cover') return raw;
  } catch {
    /* ignore */
  }
  return 'recent';
}

function coverSortKey(deck: DeckSummary): string {
  return (deck.coverCardName || deck.name || '').trim();
}

export function sortLibraryDecks(decks: DeckSummary[], sort: LibrarySort): DeckSummary[] {
  const list = [...decks];
  if (sort === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name) || b.updatedAt.localeCompare(a.updatedAt));
  } else if (sort === 'cover') {
    list.sort(
      (a, b) =>
        coverSortKey(a).localeCompare(coverSortKey(b)) ||
        a.name.localeCompare(b.name) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  } else {
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }
  return list;
}

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

const SKELETON_TILE_COUNT = 8;

function LibrarySkeleton() {
  return (
    <div
      className="db-library-skeleton"
      aria-busy="true"
      aria-label="Loading library"
      role="status"
    >
      <div className="db-library-section-title db-skeleton-title">
        <span className="db-skeleton-pulse db-skeleton-line db-skeleton-line-title" />
      </div>
      <ul className="db-library-grid" aria-hidden="true">
        {Array.from({ length: SKELETON_TILE_COUNT }, (_, i) => (
          <li key={i} className="db-library-tile db-skeleton-tile">
            <span className="db-library-tile-art db-skeleton-pulse db-skeleton-art" />
            <span className="db-library-tile-caption">
              <span className="db-skeleton-pulse db-skeleton-line db-skeleton-line-badge" />
              <span className="db-skeleton-pulse db-skeleton-line db-skeleton-line-name" />
            </span>
          </li>
        ))}
      </ul>
    </div>
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
    try {
      localStorage.setItem(LIBRARY_SORT_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const libraryStyle = {
    ['--db-card-w']: `${CARD_SIZE_PX.M}px`,
  } as CSSProperties;

  return (
    <div className="db-library" style={libraryStyle}>
      <header className="db-header">
        <h2>Deck Builder</h2>
        <div className="db-header-actions">
          <label className="db-library-sort">
            <span className="db-library-sort-label">Sort</span>
            <select
              className="db-select"
              aria-label="Library sort"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as LibrarySort)}
            >
              <option value="recent">Recent</option>
              <option value="name">A–Z</option>
              <option value="cover">A–Z (Highlighted Card)</option>
            </select>
          </label>
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
