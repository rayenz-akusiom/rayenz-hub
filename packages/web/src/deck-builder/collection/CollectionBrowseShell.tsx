import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addCardToDeck,
  cardDisplayName,
  cardMatchesSetMembership,
  cardMatchesSyntaxMembership,
  changeCardPrinting,
  collectionCardIsSought,
  collectionInDeckQuantity,
  collectionOwnedQuantity,
  collectionSearchNeedsReleaseRefresh,
  collectionTargetQuantity,
  isCollectionDeck,
  resolveDeckCards,
  syncCollectionDeck,
  toRepresentativeCardView,
  type BrowseView,
  type CardLayout,
  type CardSortMode,
  type CardView,
  type DeckDocument,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { CategoryBrowse } from '../browse/CategoryBrowse';
import { type ContextMenuPoint } from '../browse/CardTile';
import { ExportBar } from '../import-export/ExportBar';
import { PrintingPickerModal } from '../scryfall/PrintingPickerModal';
import { ScryfallSearchModal } from '../scryfall/ScryfallSearchModal';
import { useCardSize } from '../card-size';
import { useSetMembershipFilter } from '../ui/SetFilterControl';
import { useScryfallSyntaxFilter } from '../ui/SyntaxFilterControl';
import {
  cardMatchesFlagFilter,
  type FlagFilterMode,
} from '../ui/FlagFilterControl';
import { ActiveFilterChips, type ActiveFilterChip } from '../ui/ActiveFilterChips';
import { loadCardCharmsPref, saveCardCharmsPref } from '../card-charms-pref';
import { AddCardFab } from '../browse/AddCardFab';
import { CardContextMenu, type CardContextMenuState } from '../edit/CardContextMenu';
import { PlaneswalkerSubtypeBrowse } from './PlaneswalkerSubtypeBrowse';
import {
  collectionSummaryText,
  representativeFromPrinting,
  suppressCollectionCard,
  syncCollectionFromSearch,
} from './collection-sync';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';

function OpenBinderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.5 2.5h5.75c1 0 1.75.8 1.75 1.8v10.2c-.35-.45-.9-.75-1.5-.75H2.5c-.55 0-1-.45-1-1v-9.25c0-.55.45-1 1-1zm13 0c.55 0 1 .45 1 1v9.25c0 .55-.45 1-1 1H9.5c-.6 0-1.15.3-1.5.75V4.3c0-1 .75-1.8 1.75-1.8h5.75zm-6.25.25h.5v12.5h-.5z"
      />
    </svg>
  );
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function SearchSettingsModal({
  deck,
  onClose,
  onApply,
}: {
  deck: DeckDocument;
  onClose: () => void;
  onApply: (query: string, defaultQuantity: number) => void;
}) {
  const [query, setQuery] = useState(deck.collectionSearch?.query || '');
  const [quantity, setQuantity] = useState(String(deck.collectionSearch?.defaultQuantity || 1));
  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Collection search">
      <div className="db-modal-card">
        <h3>Collection search</h3>
        <label>
          Scryfall query
          <input className="db-input" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          Default target quantity
          <input
            className="db-input"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <div className="db-modal-actions">
          <button type="button" className="db-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="db-btn is-active"
            onClick={() => onApply(query.trim(), Math.max(1, Math.floor(Number(quantity) || 1)))}
            disabled={!query.trim()}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export function CollectionBrowseShell({
  deck,
  onChange,
  onBack,
  syncStatus = null,
  readOnly = false,
}: {
  deck: DeckDocument;
  onChange: (next: DeckDocument) => void;
  onBack: () => void;
  syncStatus?: DeckSyncStatus | null;
  readOnly?: boolean;
}) {
  const [view, setView] = useState<BrowseView>(deck.browseViewDefault || 'all_cards');
  const [layout, setLayout] = useState<CardLayout>(deck.cardLayoutDefault || 'grid');
  const [cardSort, setCardSort] = useState<CardSortMode>(deck.cardSortDefault || 'name_asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printingOpen, setPrintingOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [representativeOpen, setRepresentativeOpen] = useState(false);
  const [searchSettingsOpen, setSearchSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<CardContextMenuState | null>(null);
  const [syncingSearch, setSyncingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { size: cardSize, setSize: setCardSize } = useCardSize();
  const setFilter = useSetMembershipFilter();
  const syntaxFilter = useScryfallSyntaxFilter(
    deck.cards.map((card) => ({ name: card.name, scryfallId: card.scryfallId })),
  );
  const [proxyFilter, setProxyFilter] = useState<FlagFilterMode>('all');
  const [foilFilter, setFoilFilter] = useState<FlagFilterMode>('all');
  const [seekingFilter, setSeekingFilter] = useState<FlagFilterMode>('all');
  const [cardCharmsEnabled, setCardCharmsEnabled] = useState(() => loadCardCharmsPref().enabled);

  const liveDeck = useMemo(() => syncCollectionDeck(deck), [deck]);

  useEffect(() => {
    setView(deck.browseViewDefault || 'all_cards');
    setLayout(deck.cardLayoutDefault || 'grid');
    setCardSort(deck.cardSortDefault || 'name_asc');
    setSelectedIds(new Set());
  }, [deck]);

  const commit = useCallback((next: DeckDocument) => {
    const synced = syncCollectionDeck({ ...next, updatedAt: new Date().toISOString() });
    onChange(synced);
  }, [onChange]);

  useEffect(() => {
    if (!isCollectionDeck(liveDeck)) return;
    if (!collectionSearchNeedsReleaseRefresh(liveDeck.collectionSearch)) return;
    if (readOnly || syncingSearch) return;
    setSyncingSearch(true);
    void syncCollectionFromSearch(liveDeck)
      .then((next) => commit(next))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSyncingSearch(false));
  }, [commit, liveDeck, readOnly, syncingSearch, deck.deckId]);

  const selectedCards = useMemo(
    () => resolveDeckCards({ cards: liveDeck.cards, oracle: liveDeck.oracle }).filter((card) => selectedIds.has(card.instanceId)),
    [liveDeck.cards, liveDeck.oracle, selectedIds],
  );
  const primarySelected = selectedCards[0] || null;
  const contextCard =
    contextMenu != null
      ? resolveDeckCards({ cards: liveDeck.cards, oracle: liveDeck.oracle }).find(
          (card) => card.instanceId === contextMenu.instanceId,
        ) || null
      : null;
  const resolvedCards = useMemo(
    () => resolveDeckCards({ cards: liveDeck.cards, oracle: liveDeck.oracle }),
    [liveDeck.cards, liveDeck.oracle],
  );

  const browseDeck = useMemo(() => {
    const membership = setFilter.membership;
    const syntaxMembership = syntaxFilter.membership;
    return {
      ...liveDeck,
      cards: resolvedCards.filter((card) => {
        if (setFilter.active && membership && !cardMatchesSetMembership(card.name, membership)) return false;
        if (syntaxFilter.active && syntaxMembership && !cardMatchesSyntaxMembership(card.name, syntaxMembership)) return false;
        if (!cardMatchesFlagFilter(Boolean(card.proxy), proxyFilter)) return false;
        if (!cardMatchesFlagFilter(Boolean(card.foil), foilFilter)) return false;
        if (!cardMatchesFlagFilter(collectionCardIsSought(card), seekingFilter)) return false;
        return true;
      }),
    };
  }, [liveDeck, resolvedCards, setFilter.active, setFilter.membership, syntaxFilter.active, syntaxFilter.membership, proxyFilter, foilFilter, seekingFilter]);

  const viewOptions = deck.collectionTemplate === 'planeswalkers'
    ? ['all_cards', 'category', 'planeswalker_subtype'] as BrowseView[]
    : ['all_cards', 'category'] as BrowseView[];

  const filterChips: ActiveFilterChip[] = [];
  if (setFilter.active && setFilter.label) filterChips.push({ id: 'set', label: setFilter.label, onDismiss: () => setFilter.clear() });
  if (syntaxFilter.active && syntaxFilter.label) filterChips.push({ id: 'syntax', label: syntaxFilter.label, onDismiss: () => syntaxFilter.clear() });
  if (proxyFilter !== 'all') filterChips.push({ id: 'proxy', label: `Proxy ${proxyFilter}`, onDismiss: () => setProxyFilter('all') });
  if (foilFilter !== 'all') filterChips.push({ id: 'foil', label: `Foil ${foilFilter}`, onDismiss: () => setFoilFilter('all') });
  if (seekingFilter !== 'all') filterChips.push({ id: 'seeking', label: `Seeking ${seekingFilter}`, onDismiss: () => setSeekingFilter('all') });

  function setSelectedCardField(
    instanceId: string,
    patch: Partial<Pick<DeckDocument['cards'][number], 'ownedQuantity' | 'quantity' | 'inDeckQuantity'>>,
  ) {
    commit({
      ...liveDeck,
      cards: liveDeck.cards.map((card) => {
        if (card.instanceId !== instanceId) return card;
        const quantity = patch.quantity != null ? Math.max(1, Math.floor(patch.quantity)) : collectionTargetQuantity(card);
        const owned = patch.ownedQuantity != null ? Math.max(0, Math.floor(patch.ownedQuantity)) : collectionOwnedQuantity(card);
        const inDeckQuantity = patch.inDeckQuantity != null ? clampInt(patch.inDeckQuantity, 0, owned) : collectionInDeckQuantity(card);
        return { ...card, quantity, ownedQuantity: owned, inDeckQuantity };
      }),
    });
  }

  function onAddCard(printing: PrintingFields) {
    const defaultQuantity = liveDeck.collectionSearch?.defaultQuantity || 1;
    const next = addCardToDeck(liveDeck, printing, 'Collection', { quantity: defaultQuantity });
    const added = next.cards[next.cards.length - 1];
    if (added) {
      added.ownedQuantity = 0;
      added.inDeckQuantity = 0;
      added.collectionSource = 'manual';
      setSelectedIds(new Set([added.instanceId]));
    }
    commit(next);
    setAddOpen(false);
  }

  function onRemoveSelection() {
    if (!selectedIds.size) return;
    let next = liveDeck;
    for (const id of selectedIds) {
      const card = next.cards.find((row) => row.instanceId === id);
      if (!card) continue;
      if (card.collectionSource === 'search' && collectionOwnedQuantity(card) === 0 && collectionInDeckQuantity(card) === 0) {
        next = suppressCollectionCard(next, id);
      } else {
        next = { ...next, cards: next.cards.filter((row) => row.instanceId !== id) };
      }
    }
    commit(next);
    setSelectedIds(new Set());
  }

  const deckMeta = `${collectionSummaryText(liveDeck)}${syncingSearch ? ' · syncing search…' : ''}`;

  return (
    <div className="db-shell">
      <div className="hub-sticky-chrome">
        <header className="db-header">
          <button type="button" className="db-btn db-library-back" onClick={onBack} aria-label="Library" title="Library">
            <OpenBinderIcon />
          </button>
          <ExportBar
            view={view}
            onViewChange={(next) => {
              setView(next);
              commit({ ...liveDeck, browseViewDefault: next });
            }}
            layout={layout}
            onLayoutChange={(next) => {
              setLayout(next);
              commit({ ...liveDeck, cardLayoutDefault: next });
            }}
            cardSort={cardSort}
            onCardSortChange={(next) => {
              setCardSort(next);
              commit({ ...liveDeck, cardSortDefault: next });
            }}
            cardSize={cardSize}
            onCardSizeChange={setCardSize}
            setFilter={setFilter}
            syntaxFilter={syntaxFilter}
            proxyFilter={proxyFilter}
            onProxyFilterChange={setProxyFilter}
            foilFilter={foilFilter}
            onFoilFilterChange={setFoilFilter}
            seekingFilter={seekingFilter}
            onSeekingFilterChange={setSeekingFilter}
            cardCharmsEnabled={cardCharmsEnabled}
            onCardCharmsEnabledChange={(enabled) => {
              setCardCharmsEnabled(enabled);
              saveCardCharmsPref({ enabled });
            }}
            viewOptions={viewOptions}
          />
          {!readOnly ? (
            <>
              <button type="button" className="db-btn" onClick={() => setSearchSettingsOpen(true)}>
                Search
              </button>
              <button type="button" className="db-btn" onClick={() => setRepresentativeOpen(true)}>
                Representative
              </button>
            </>
          ) : null}
        </header>
        <ActiveFilterChips
          chips={filterChips}
          onClearAll={() => {
            setFilter.clear();
            syntaxFilter.clear();
            setProxyFilter('all');
            setFoilFilter('all');
            setSeekingFilter('all');
          }}
        />
        {error ? <p className="hub-warn">{error}</p> : null}
        {primarySelected && !readOnly ? (
          <div className="db-collection-stats">
            <strong>{cardDisplayName(primarySelected)}</strong>
            <label>
              Owned
              <input
                className="db-input"
                type="number"
                min="0"
                value={collectionOwnedQuantity(primarySelected)}
                onChange={(e) => setSelectedCardField(primarySelected.instanceId, { ownedQuantity: Number(e.target.value) })}
              />
            </label>
            <label>
              Target
              <input
                className="db-input"
                type="number"
                min="1"
                value={collectionTargetQuantity(primarySelected)}
                onChange={(e) => setSelectedCardField(primarySelected.instanceId, { quantity: Number(e.target.value) })}
              />
            </label>
            <label>
              In deck
              <input
                className="db-input"
                type="number"
                min="0"
                max={String(collectionOwnedQuantity(primarySelected))}
                value={collectionInDeckQuantity(primarySelected)}
                onChange={(e) => setSelectedCardField(primarySelected.instanceId, { inDeckQuantity: Number(e.target.value) })}
              />
            </label>
            <button type="button" className="db-btn" onClick={() => setPrintingOpen(true)}>
              Printing
            </button>
            <button type="button" className="db-btn db-btn-danger" onClick={onRemoveSelection}>
              Remove
            </button>
          </div>
        ) : null}
      </div>

      <div className="db-main">
        {view === 'planeswalker_subtype' ? (
          <PlaneswalkerSubtypeBrowse
            deck={browseDeck}
            representativeCard={liveDeck.representativeCard}
            selectedIds={selectedIds}
            onSelectCard={(card) => setSelectedIds(new Set([card.instanceId]))}
            onCardContextMenu={readOnly ? undefined : (card, at) => {
              setSelectedIds(new Set([card.instanceId]));
              setContextMenu({ x: at.clientX, y: at.clientY, instanceId: card.instanceId });
            }}
            layout={layout}
            cardSort={cardSort}
            onRename={readOnly ? undefined : (name) => commit({ ...liveDeck, name })}
            onSetDescription={readOnly ? undefined : (description) => commit({ ...liveDeck, description })}
            deckMeta={deckMeta}
            syncStatus={syncStatus}
            onPickRepresentative={readOnly ? undefined : () => setRepresentativeOpen(true)}
          />
        ) : (
          <CategoryBrowse
            deck={browseDeck}
            selectedIds={selectedIds}
            onSelectCard={(card) => setSelectedIds((prev) => (prev.size === 1 && prev.has(card.instanceId) ? new Set() : new Set([card.instanceId])))}
            layout={layout}
            cardSort={cardSort}
            onCardContextMenu={readOnly ? undefined : (card, at) => {
              setSelectedIds(new Set([card.instanceId]));
              setContextMenu({ x: at.clientX, y: at.clientY, instanceId: card.instanceId });
            }}
            onRename={readOnly ? undefined : (name) => commit({ ...liveDeck, name })}
            onSetDescription={readOnly ? undefined : (description) => commit({ ...liveDeck, description })}
            deckMeta={deckMeta}
            syncStatus={syncStatus}
            browseView={view}
            representativeCard={liveDeck.representativeCard ? toRepresentativeCardView(liveDeck.representativeCard) : null}
            representativeLabel="Binder"
            onPickRepresentative={readOnly ? undefined : () => setRepresentativeOpen(true)}
          />
        )}
      </div>

      {addOpen ? (
        <ScryfallSearchModal
          deck={liveDeck}
          onClose={() => setAddOpen(false)}
          onAdd={(printing) => onAddCard(printing)}
          allowQuickAdd
        />
      ) : null}

      {representativeOpen ? (
        <ScryfallSearchModal
          deck={liveDeck}
          onClose={() => setRepresentativeOpen(false)}
          onAdd={(printing) => {
            commit({ ...liveDeck, representativeCard: representativeFromPrinting(printing) });
            setRepresentativeOpen(false);
          }}
          title="Choose representative card"
        />
      ) : null}

      {searchSettingsOpen ? (
        <SearchSettingsModal
          deck={liveDeck}
          onClose={() => setSearchSettingsOpen(false)}
          onApply={(query, defaultQuantity) => {
            setSearchSettingsOpen(false);
            setSyncingSearch(true);
            void syncCollectionFromSearch(
              {
                ...liveDeck,
                collectionSearch: {
                  ...(liveDeck.collectionSearch || {
                    query,
                    defaultQuantity,
                    lastSyncedAt: null,
                    lastOpenedAt: null,
                    latestReleaseDate: null,
                    suppressedKeys: [],
                  }),
                  query,
                  defaultQuantity,
                },
              },
              query,
            )
              .then((next) => commit(next))
              .catch((e) => setError(e instanceof Error ? e.message : String(e)))
              .finally(() => setSyncingSearch(false));
          }}
        />
      ) : null}

      {printingOpen && primarySelected ? (
        <PrintingPickerModal
          cardName={primarySelected.name}
          defaultScryfallId={primarySelected.scryfallId}
          selectedScryfallId={primarySelected.scryfallId}
          foilDefault={primarySelected.foil}
          proxyDefault={Boolean(primarySelected.proxy)}
          confirmLabel="Apply printing"
          title={`Printing - ${cardDisplayName(primarySelected)}`}
          onClose={() => setPrintingOpen(false)}
          onConfirm={(printing) => {
            commit(changeCardPrinting(liveDeck, primarySelected.instanceId, printing));
            setPrintingOpen(false);
          }}
        />
      ) : null}

      {contextMenu && contextCard && !readOnly ? (
        <CardContextMenu
          state={contextMenu}
          selectionCount={selectedIds.size}
          isCover={liveDeck.coverInstanceId === contextCard.instanceId}
          foil={Boolean(contextCard.foil)}
          foilEnabled
          proxy={Boolean(contextCard.proxy)}
          seeking={collectionCardIsSought(contextCard)}
          onClose={() => setContextMenu(null)}
          onToggleFoil={() => commit({ ...liveDeck, cards: liveDeck.cards.map((card) => card.instanceId === contextCard.instanceId ? { ...card, foil: !card.foil } : card) })}
          onToggleProxy={() => commit({ ...liveDeck, cards: liveDeck.cards.map((card) => card.instanceId === contextCard.instanceId ? { ...card, proxy: !card.proxy } : card) })}
          onSetCover={() => commit({ ...liveDeck, representativeCard: representativeFromPrinting({
            name: contextCard.name,
            scryfallId: contextCard.scryfallId || '',
            setCode: contextCard.setCode || '',
            collectorNumber: contextCard.collectorNumber || '',
            typeLine: contextCard.typeLine,
            colourIdentity: contextCard.colourIdentity,
            layout: contextCard.layout,
            foil: Boolean(contextCard.foil),
            printedName: contextCard.printedName,
            flavorName: contextCard.flavorName,
            manaValue: contextCard.manaValue,
          }) })}
          onClearCover={() => commit({ ...liveDeck, representativeCard: null, coverInstanceId: null })}
          onChangePrinting={() => setPrintingOpen(true)}
          onRemove={onRemoveSelection}
        />
      ) : null}

      {readOnly ? null : <AddCardFab onAddClick={() => setAddOpen(true)} />}
    </div>
  );
}
