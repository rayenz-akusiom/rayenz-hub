import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import type { DeckOwnership, DeckSummary, DeckVisibility } from '@rayenz-hub/shared';
import {
  deckOwnership,
  deckVisibility,
  isPrivateDeck,
  ownershipLabel,
  partitionLibraryByOwnership,
} from '@rayenz-hub/shared';
import { builderHash, hubUserSlug, type BuilderFormat } from '../../../hub/routes';
import { toKebabCase } from '../../../lib/string-utils';
import { CARD_SIZE_PX } from '../../card-size';
import { LibraryCoverArt } from '../../library/LibraryCoverArt';
import {
  DeckOwnershipContextMenu,
  type DeckOwnershipMenuState,
} from '../../library/DeckOwnershipContextMenu';
import { FormatBadge } from '../../ui/FormatBadge';
import { LibrarySkeleton, LibrarySortSelect } from '../../library/library-chrome';
import {
  persistLibrarySort,
  readLibrarySort,
  sortLibraryDecks,
  type LibrarySort,
} from '../../library/library-sort';

const OWNERSHIP_DRAG_TYPE = 'application/x-rayenz-deck-ownership';

function LibraryGrid({
  builderFormat,
  ownership,
  decks,
  onOpen,
  onDelete,
  onContextMenu,
  sampleIds,
  dropActive,
  onDragOverLane,
  onDragLeaveLane,
  onDropLane,
}: {
  builderFormat: BuilderFormat;
  ownership: DeckOwnership;
  decks: DeckSummary[];
  onOpen: (deckId: string) => void;
  onDelete: (deckId: string) => void;
  onContextMenu: (deck: DeckSummary, x: number, y: number) => void;
  sampleIds?: Set<string>;
  dropActive: boolean;
  onDragOverLane: (e: DragEvent) => void;
  onDragLeaveLane: (e: DragEvent) => void;
  onDropLane: (e: DragEvent, ownership: DeckOwnership) => void;
}) {
  return (
    <section
      className={`db-library-section db-library-ownership-lane${dropActive ? ' is-drop-target' : ''}`}
      aria-label={ownershipLabel(ownership)}
      data-ownership={ownership}
      onDragOver={onDragOverLane}
      onDragLeave={onDragLeaveLane}
      onDrop={(e) => onDropLane(e, ownership)}
    >
      <h3 className="db-library-section-title">
        {ownershipLabel(ownership)}
        <span className="db-count">({decks.length})</span>
      </h3>
      {decks.length ? (
        <ul className="db-library-grid">
          {decks.map((d) => {
            const isSample = sampleIds?.has(d.deckId) ?? false;
            const isTheory = deckOwnership(d) === 'theory';
            const isPrivate = isPrivateDeck(d);
            const updated = `Updated ${new Date(d.updatedAt).toLocaleString()}`;
            const dual = Boolean(d.coverImageUrl && d.coverImageUrlSecondary);
            const href = builderHash(builderFormat, hubUserSlug(), toKebabCase(d.name));
            const openLabel = isSample ? `${d.name} (Sample)` : d.name;
            return (
              <li
                key={d.deckId}
                className={`db-library-tile${dual ? ' is-partner-pair' : ''}${
                  d.coverPartnerStatus === 'illegal' ? ' is-illegal-pair' : ''
                }${isSample ? ' is-sample' : ''}${isTheory ? ' is-theory' : ''}${
                  isPrivate && !isSample ? ' is-private' : ''
                }`}
                draggable={!isSample}
                onDragStart={(e) => {
                  if (isSample) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData(OWNERSHIP_DRAG_TYPE, d.deckId);
                  e.dataTransfer.setData('text/plain', d.deckId);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onContextMenu={(e) => {
                  if (isSample) return;
                  e.preventDefault();
                  onContextMenu(d, e.clientX, e.clientY);
                }}
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
                    {isTheory && !isSample ? (
                      <span className="db-theory-badge" aria-hidden="true">
                        Theory
                      </span>
                    ) : null}
                    {isPrivate && !isSample ? (
                      <span className="db-private-badge" aria-hidden="true">
                        Private
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
      ) : (
        <p className="db-library-lane-empty hub-muted">
          {ownership === 'owned'
            ? 'No owned decks — drag a Theory deck here, or create one.'
            : 'No theory decks — right-click a tile or drag here to mark as Theory.'}
        </p>
      )}
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
  onSetOwnership,
  onSetVisibility,
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
  onSetOwnership?: (deckId: string, ownership: DeckOwnership) => void;
  onSetVisibility?: (deckId: string, visibility: DeckVisibility) => void;
  onRefreshRemote?: () => void;
}) {
  const [sort, setSort] = useState<LibrarySort>(() => readLibrarySort());
  const [dropTarget, setDropTarget] = useState<DeckOwnership | null>(null);
  const [menu, setMenu] = useState<DeckOwnershipMenuState | null>(null);

  const sorted = useMemo(() => sortLibraryDecks(decks, sort), [decks, sort]);
  const { owned, theory } = useMemo(() => partitionLibraryByOwnership(sorted), [sorted]);
  const sampleIds = useMemo(
    () => (sampleDeck ? new Set([sampleDeck.deckId]) : new Set<string>()),
    [sampleDeck],
  );

  function onSortChange(next: LibrarySort) {
    setSort(next);
    persistLibrarySort(next);
  }

  function onDragOverLane(e: DragEvent, ownership: DeckOwnership) {
    if (!onSetOwnership) return;
    if (
      !e.dataTransfer.types.includes(OWNERSHIP_DRAG_TYPE) &&
      !e.dataTransfer.types.includes('text/plain')
    ) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(ownership);
  }

  function onDragLeaveLane(e: DragEvent) {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setDropTarget(null);
  }

  function onDropLane(e: DragEvent, ownership: DeckOwnership) {
    e.preventDefault();
    setDropTarget(null);
    if (!onSetOwnership) return;
    const deckId =
      e.dataTransfer.getData(OWNERSHIP_DRAG_TYPE) || e.dataTransfer.getData('text/plain');
    if (!deckId) return;
    const current = decks.find((d) => d.deckId === deckId);
    if (!current || deckOwnership(current) === ownership) return;
    onSetOwnership(deckId, ownership);
  }

  const libraryStyle = {
    ['--db-card-w']: `${CARD_SIZE_PX.M}px`,
  } as CSSProperties;

  const emptyCopy =
    builderFormat === 'commander'
      ? {
          lead: 'No Commander decks saved in Hub yet.',
          hint: 'Create or import a Commander deck by pasting Archidekt import text.',
        }
      : {
          lead: 'No cube decks saved in Hub yet.',
          hint: 'Create a new cube with a target size and colour-identity browse defaults, or paste Archidekt import text.',
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
                builderFormat={builderFormat}
                ownership="owned"
                decks={[sampleDeck]}
                onOpen={onOpen}
                onDelete={onDelete}
                onContextMenu={() => {}}
                sampleIds={sampleIds}
                dropActive={false}
                onDragOverLane={() => {}}
                onDragLeaveLane={() => {}}
                onDropLane={() => {}}
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
                builderFormat={builderFormat}
                ownership="owned"
                decks={owned}
                onOpen={onOpen}
                onDelete={onDelete}
                onContextMenu={(d, x, y) =>
                  setMenu({
                    x,
                    y,
                    deckId: d.deckId,
                    current: deckOwnership(d),
                    visibility: deckVisibility(d),
                  })
                }
                dropActive={dropTarget === 'owned'}
                onDragOverLane={(e) => onDragOverLane(e, 'owned')}
                onDragLeaveLane={onDragLeaveLane}
                onDropLane={onDropLane}
              />
              <LibraryGrid
                builderFormat={builderFormat}
                ownership="theory"
                decks={theory}
                onOpen={onOpen}
                onDelete={onDelete}
                onContextMenu={(d, x, y) =>
                  setMenu({
                    x,
                    y,
                    deckId: d.deckId,
                    current: deckOwnership(d),
                    visibility: deckVisibility(d),
                  })
                }
                dropActive={dropTarget === 'theory'}
                onDragOverLane={(e) => onDragOverLane(e, 'theory')}
                onDragLeaveLane={onDragLeaveLane}
                onDropLane={onDropLane}
              />
            </div>
          )}
        </>
      )}
      {menu && (onSetOwnership || onSetVisibility) ? (
        <DeckOwnershipContextMenu
          state={menu}
          onClose={() => setMenu(null)}
          onSetOwnership={onSetOwnership}
          onSetVisibility={onSetVisibility}
        />
      ) : null}
    </div>
  );
}
