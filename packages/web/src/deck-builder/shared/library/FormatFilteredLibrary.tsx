import { useMemo, useState, type CSSProperties } from 'react';
import type { DeckFormat, DeckSummary } from '@rayenz-hub/shared';
import { builderHash, HUB_USER_SLUG, type BuilderFormat } from '../../../hub/routes';
import { toKebabCase } from '../../../lib/string-utils';
import { CARD_SIZE_PX } from '../../card-size';
import { LibraryCoverArt } from '../../library/LibraryCoverArt';
import { FormatBadge } from '../../ui/FormatBadge';
import { LibrarySkeleton, LibrarySortSelect } from '../../library/library-chrome';
import {
  persistLibrarySort,
  readLibrarySort,
  sortLibraryDecks,
  type LibrarySort,
} from '../../library/library-sort';

function LibraryGrid({
  format,
  builderFormat,
  decks,
  onOpen,
  onDelete,
  sampleIds,
}: {
  format: DeckFormat;
  builderFormat: BuilderFormat;
  decks: DeckSummary[];
  onOpen: (deckId: string) => void;
  onDelete: (deckId: string) => void;
  sampleIds?: Set<string>;
}) {
  if (!decks.length) return null;

  return (
    <section className="db-library-section" aria-label={format === 'commander' ? 'Commander' : 'Cube'}>
      <ul className="db-library-grid">
        {decks.map((d) => {
          const isSample = sampleIds?.has(d.deckId) ?? false;
          const updated = `Updated ${new Date(d.updatedAt).toLocaleString()}`;
          const dual = Boolean(d.coverImageUrl && d.coverImageUrlSecondary);
          const href = builderHash(builderFormat, HUB_USER_SLUG, toKebabCase(d.name));
          const openLabel = isSample ? `${d.name} (Sample)` : d.name;
          return (
            <li
              key={d.deckId}
              className={`db-library-tile${dual ? ' is-partner-pair' : ''}${
                d.coverPartnerStatus === 'illegal' ? ' is-illegal-pair' : ''
              }${isSample ? ' is-sample' : ''}`}
            >
              <a
                href={href}
                className="db-library-tile-open"
                aria-label={openLabel}
                title={
                  isSample
                    ? 'Sample deck — edits stay on this device and are not saved to Hub'
                    : d.coverPartnerStatus === 'illegal'
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
                  {isSample ? (
                    <span className="db-sample-badge" aria-hidden="true">
                      Sample
                    </span>
                  ) : null}
                  <span className="db-library-tile-name">{d.name}</span>
                </span>
              </a>
              <button
                type="button"
                className="db-library-tile-delete"
                aria-label={isSample ? `Dismiss sample ${d.name}` : `Delete ${d.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const confirmMsg = isSample
                    ? `Dismiss sample "${d.name}"? You can still create or import your own decks.`
                    : `Remove "${d.name}" from Hub library?`;
                  if (window.confirm(confirmMsg)) {
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
  sampleDeck = null,
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
  /** When set with an empty real library, shown above the empty-state onboarding. */
  sampleDeck?: DeckSummary | null;
  loading?: boolean;
  error?: string | null;
  onOpen: (deckId: string) => void;
  onAdd: () => void;
  onDelete: (deckId: string) => void;
  onRefreshRemote?: () => void;
}) {
  const [sort, setSort] = useState<LibrarySort>(() => readLibrarySort());

  const sorted = useMemo(() => sortLibraryDecks(decks, sort), [decks, sort]);
  const sampleIds = useMemo(
    () => (sampleDeck ? new Set([sampleDeck.deckId]) : new Set<string>()),
    [sampleDeck],
  );

  function onSortChange(next: LibrarySort) {
    setSort(next);
    persistLibrarySort(next);
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

  const showEmptyOnboarding = !decks.length;
  const showSample = Boolean(sampleDeck && showEmptyOnboarding);

  return (
    <div className="db-library" style={libraryStyle}>
      <header className="db-header">
        <h2>
          {title} <span className="db-count">({decks.length})</span>
        </h2>
        <div className="db-header-actions">
          <LibrarySortSelect sort={sort} onChange={onSortChange} />
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
      ) : (
        <>
          {showSample && sampleDeck ? (
            <div className="db-library-sections">
              <LibraryGrid
                format={builderFormat}
                builderFormat={builderFormat}
                decks={[sampleDeck]}
                onOpen={onOpen}
                onDelete={onDelete}
                sampleIds={sampleIds}
              />
            </div>
          ) : null}
          {showEmptyOnboarding ? (
            <div className="db-empty-state">
              <p>{emptyCopy.lead}</p>
              <p>{emptyCopy.hint}</p>
              {showSample ? (
                <p className="db-empty-sample-hint">
                  Or open the sample deck above to explore Hub — changes stay on this device.
                </p>
              ) : null}
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
        </>
      )}
    </div>
  );
}
