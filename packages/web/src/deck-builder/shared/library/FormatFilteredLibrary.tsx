import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import type { DeckFormat, DeckSummary } from '@rayenz-hub/shared';
import { builderHash, HUB_USER_SLUG, type BuilderFormat } from '../../../hub/routes';
import { toKebabCase } from '../../../lib/string-utils';
import { CARD_SIZE_PX } from '../../card-size';
import { FormatBadge } from '../../ui/FormatBadge';
import {
  readLibrarySort,
  sortLibraryDecks,
  type LibrarySort,
  LIBRARY_SORT_KEY,
} from '../../library/LibraryView';

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

type CoverImgStatus = 'loading' | 'loaded' | 'error';

function LibraryCoverImage({ src, label }: { src: string; label: string }) {
  const [status, setStatus] = useState<CoverImgStatus>('loading');

  useEffect(() => {
    setStatus('loading');
  }, [src]);

  const imgRef = useCallback((el: HTMLImageElement | null) => {
    if (!el) return;
    if (!el.complete) return;
    if (el.naturalWidth > 0) setStatus('loaded');
    else setStatus('error');
  }, []);

  if (status === 'error') {
    return <span className="db-library-tile-fallback">{label}</span>;
  }

  const loading = status === 'loading';

  return (
    <span className="db-library-cover-media">
      {loading ? (
        <span className="db-card-skeleton db-skeleton-pulse" aria-hidden="true">
          <span className="db-card-skeleton-name">{label}</span>
        </span>
      ) : null}
      <img
        ref={imgRef}
        src={src}
        alt=""
        loading="lazy"
        className={loading ? 'is-loading' : undefined}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
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
        <LibraryCoverImage src={deck.coverImageUrl} label={deck.name} />
      </span>
    );
  }

  return (
    <span
      className={`db-library-tile-art is-partner-pair${illegal ? ' is-illegal' : ''}`}
      aria-hidden="true"
    >
      <span className="db-library-tile-face">
        <LibraryCoverImage src={deck.coverImageUrl} label={deck.name} />
      </span>
      <PartnerTie illegal={illegal} />
      <span className="db-library-tile-face">
        <LibraryCoverImage src={deck.coverImageUrlSecondary!} label={deck.name} />
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

function LibraryGrid({
  format,
  builderFormat,
  decks,
  onOpen,
  onDelete,
}: {
  format: DeckFormat;
  builderFormat: BuilderFormat;
  decks: DeckSummary[];
  onOpen: (deckId: string) => void;
  onDelete: (deckId: string) => void;
}) {
  if (!decks.length) return null;

  return (
    <section className="db-library-section" aria-label={format === 'commander' ? 'Commander' : 'Cube'}>
      <ul className="db-library-grid">
        {decks.map((d) => {
          const updated = `Updated ${new Date(d.updatedAt).toLocaleString()}`;
          const dual = Boolean(d.coverImageUrl && d.coverImageUrlSecondary);
          const href = builderHash(builderFormat, HUB_USER_SLUG, toKebabCase(d.name));
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

export function FormatFilteredLibrary({
  builderFormat,
  title,
  addLabel = 'Add deck',
  decks,
  loading,
  error,
  onOpen,
  onAdd,
  onDelete,
  onRefreshRemote,
}: {
  builderFormat: BuilderFormat;
  title: string;
  addLabel?: string;
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

  const emptyCopy =
    builderFormat === 'commander'
      ? {
          lead: 'No Commander decks saved in Hub yet.',
          hint: 'Create or import a Commander deck by pasting Archidekt text or fetching from Archidekt when the bridge is available.',
        }
      : {
          lead: 'No cube decks saved in Hub yet.',
          hint: 'Create a new cube with a target size and colour-identity browse defaults, or import from Archidekt.',
        };

  return (
    <div className="db-library" style={libraryStyle}>
      <header className="db-header">
        <h2>
          {title} <span className="db-count">({decks.length})</span>
        </h2>
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
            {addLabel}
          </button>
        </div>
      </header>
      {error ? <p className="db-error">{error}</p> : null}
      {loading ? (
        <LibrarySkeleton />
      ) : !decks.length ? (
        <div className="db-empty-state">
          <p>{emptyCopy.lead}</p>
          <p>{emptyCopy.hint}</p>
          <button type="button" className="db-btn is-active" onClick={onAdd}>
            {addLabel}
          </button>
        </div>
      ) : (
        <div className="db-library-sections">
          <LibraryGrid
            format={builderFormat}
            builderFormat={builderFormat}
            decks={sorted}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}
