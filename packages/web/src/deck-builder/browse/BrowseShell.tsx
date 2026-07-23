import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  addCardToDeck,
  addSecondaryCategory,
  cardDisplayName,
  cardSupportsFoilToggle,
  categoryTargetsMismatchCubeSize,
  changeCardPrinting,
  deckCategoryOptions,
  deckHeaderTarget,
  deckSize,
  deckSizeMismatch,
  defaultBrowseView,
  ensureCategoryDef,
  incompleteEntryCount,
  isCategoryBrowseView,
  moveCardCategory,
  moveCardsToDefaultCategories,
  placeCardInCommanderSlot,
  queueCardsAsOut,
  removeCardsFromDeck,
  removeSecondaryCategory,
  secondaryCategoriesOf,
  setCardsFoil,
  setCardsProxy,
  syncCardsWithFormalSwaps,
  upsertOracle,
  type BrowseView,
  type CardView,
  type CardLayout,
  type CardSortMode,
  type DeckDocument,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { CategoryBrowse } from './CategoryBrowse';
import { ColourIdentityBrowse } from './ColourIdentityBrowse';
import { UnifiedListBrowse } from './UnifiedListBrowse';
import { SwapQueuePanel } from '../swaps/SwapQueuePanel';
import { draftFromFormalEntry, type SwapEditDraft } from '../swaps/swap-edit-chrome';
import { findMatchingPrintingInstance } from '../swaps/swap-pickers';
import { addLookingForCard, removeLookingForEntry } from '../swaps/useSwapQueue';
import { MoveSheet } from '../edit/MoveSheet';
import { CardContextMenu, type CardContextMenuState } from '../edit/CardContextMenu';
import { CategorySettingsPanel } from '../edit/CategorySettingsPanel';
import { CategoryEditDialog } from '../edit/CategoryEditDialog';
import { ExportBar } from '../import-export/ExportBar';
import { DeckActionsMenu } from '../import-export/DeckActionsMenu';
import { useScryfallEnrich } from '../scryfall/useScryfallEnrich';
import { ScryfallSearchModal } from '../scryfall/ScryfallSearchModal';
import { PrintingPickerModal } from '../scryfall/PrintingPickerModal';
import { useCardSize } from '../card-size';
import { DeckProfilePanel } from '../profile/DeckProfilePanel';
import { FoilIcon } from '../../cards/FoilIcon';
import { ProxyIcon } from '../../cards/ProxyIcon';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.5 2.5h5.25c.55 0 1 .45 1 1v10.25c0-.41-.34-.75-.75-.75H3.5c-.55 0-1-.45-1-1v-8.5c0-.55.45-1 1-1zm6.25 0H15c.55 0 1 .45 1 1v8.5c0 .55-.45 1-1 1H9.75c.41 0 .75.34.75.75V3.5c0-.55-.45-1-1-1zM3.5 14.5h5.5c.83 0 1.5.45 1.5 1H3.5c-.55 0-1-.45-1-1s.45-1 1-1zm9.5 0h1.5c.55 0 1 .45 1 1s-.45 1-1 1h-3c0-.55.67-1 1.5-1z"
      />
    </svg>
  );
}

function isToggleModifier(e?: MouseEvent | ReactKeyboardEvent): boolean {
  if (!e) return false;
  return Boolean(e.ctrlKey || e.metaKey);
}

function isShiftSelect(e?: MouseEvent | ReactKeyboardEvent): boolean {
  if (!e) return false;
  return Boolean(e.shiftKey) && !isToggleModifier(e);
}

function rangeIds(order: string[], fromId: string, toId: string): string[] {
  const a = order.indexOf(fromId);
  const b = order.indexOf(toId);
  if (a < 0 || b < 0) return [toId];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return order.slice(lo, hi + 1);
}

export function BrowseShell({
  deck,
  onChange,
  onBack,
  syncStatus = null,
}: {
  deck: DeckDocument;
  onChange: (next: DeckDocument) => void;
  onBack: () => void;
  syncStatus?: DeckSyncStatus | null;
}) {
  const [view, setView] = useState<BrowseView>(
    deck.browseViewDefault || defaultBrowseView(deck.format),
  );
  const [layout, setLayout] = useState<CardLayout>(deck.cardLayoutDefault || 'stacked');
  const [cardSort, setCardSort] = useState<CardSortMode>(deck.cardSortDefault || 'name_asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [visibleOrder, setVisibleOrder] = useState<string[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [printingOpen, setPrintingOpen] = useState(false);
  const [draft, setDraft] = useState<SwapEditDraft | null>(null);
  const [asideTab, setAsideTab] = useState<'deck' | 'profile'>('deck');
  const [contextMenu, setContextMenu] = useState<CardContextMenuState | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const { size: cardSize, setSize: setCardSize, widthPx: cardWidthPx } = useCardSize();
  const shellRef = useRef<HTMLDivElement>(null);
  const cardSizeReady = useRef(false);
  const visibleOrderRef = useRef(visibleOrder);
  visibleOrderRef.current = visibleOrder;

  // Disable stack margin transitions before paint when --db-card-w changes
  // (avoids "fly in from above" while keeping hover expand animation).
  useLayoutEffect(() => {
    if (!cardSizeReady.current) {
      cardSizeReady.current = true;
      return;
    }
    const el = shellRef.current;
    if (!el) return;
    el.setAttribute('data-card-size-resizing', '');
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        el.removeAttribute('data-card-size-resizing');
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      el.removeAttribute('data-card-size-resizing');
    };
  }, [cardWidthPx]);

  const selectedCards = useMemo(
    () => deck.cards.filter((c) => selectedIds.has(c.instanceId)),
    [deck.cards, selectedIds],
  );
  const selectionCount = selectedCards.length;
  const multi = selectionCount > 1;
  const primarySelected = selectedCards[0] || null;

  const incomplete = incompleteEntryCount(deck.formalSwapEntries);
  const size = deckSize(deck);
  const editingSwap = Boolean(draft);

  const deckRef = useRef(deck);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  /** Apply a full document; keeps deckRef ahead of React props so rapid edits don't clobber each other. */
  const commit = useCallback(
    (next: DeckDocument) => {
      deckRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  /** Merge a patch onto the latest known deck (avoids stale prop spreads). */
  const commitPatch = useCallback(
    (patch: Partial<DeckDocument>) => {
      commit({
        ...deckRef.current,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    },
    [commit],
  );

  // Adopt parent deck when switching decks or when parent has equal/newer data.
  useEffect(() => {
    const local = deckRef.current;
    if (deck.deckId !== local.deckId) {
      deckRef.current = deck;
      setView(deck.browseViewDefault || defaultBrowseView(deck.format));
      setLayout(deck.cardLayoutDefault || 'stacked');
      setCardSort(deck.cardSortDefault || 'name_asc');
      setSelectedIds(new Set());
      setSelectionAnchorId(null);
      return;
    }
    if (deck.updatedAt >= local.updatedAt) {
      deckRef.current = deck;
    }
  }, [deck]);

  const onEnrichPatch = useCallback(
    (next: DeckDocument) => {
      // Always merge enrich results onto our latest deck so concurrent target/prefs
      // edits are not wiped if enrich started from a stale snapshot.
      const latest = deckRef.current;
      const nextById = new Map(next.cards.map((c) => [c.instanceId, c]));
      const mergedCards = latest.cards.map((c) => {
        const n = nextById.get(c.instanceId);
        if (!n?.scryfallId || n.scryfallId === c.scryfallId) return c;
        return { ...c, scryfallId: n.scryfallId };
      });
      let mergedOracle = { ...(latest.oracle || {}) };
      for (const [key, entry] of Object.entries(next.oracle || {})) {
        mergedOracle = upsertOracle(mergedOracle, key, entry);
      }
      commit({
        ...latest,
        cards: mergedCards,
        oracle: mergedOracle,
        updatedAt: new Date().toISOString(),
      });
    },
    [commit],
  );

  const isColourIdentityView =
    view === 'colour_identity' || view === 'colour_identity_spells';
  const isUnifiedListView = view === 'unified_list';
  // Enrich CI/type/leader keywords when missing; Archidekt imports already have layout defaults.
  const { enriching } = useScryfallEnrich(deck, true, onEnrichPatch);

  const headerTarget = deckHeaderTarget(deck);
  const sizeWarn = deckSizeMismatch(deck);
  const targetsVsCubeWarn = categoryTargetsMismatchCubeSize(deck);
  const sizeLabel =
    headerTarget != null ? `${size}/${headerTarget} cards` : `${size} cards`;
  const deckMeta = [
    sizeLabel,
    sizeWarn ? 'size warning' : null,
    targetsVsCubeWarn ? 'category targets ≠ cube size' : null,
    incomplete ? `${incomplete} incomplete swaps` : null,
    enriching ? 'Enriching…' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionAnchorId(null);
    setContextMenu(null);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (moveOpen || printingOpen || addOpen || categoriesOpen || editingCategory || contextMenu) {
        return;
      }
      if (selectedIds.size) clearSelection();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    selectedIds.size,
    clearSelection,
    moveOpen,
    printingOpen,
    addOpen,
    categoriesOpen,
    editingCategory,
    contextMenu,
  ]);

  // Drop selection entries that no longer exist on the deck.
  useEffect(() => {
    const live = new Set(deck.cards.map((c) => c.instanceId));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [deck.cards]);

  const onVisibleOrderChange = useCallback((ids: string[]) => {
    setVisibleOrder((prev) => {
      if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) {
        return prev;
      }
      return ids;
    });
  }, []);

  function onSelectCard(card: CardView, e?: MouseEvent | ReactKeyboardEvent) {
    setContextMenu(null);
    const id = card.instanceId;

    if (isShiftSelect(e) && selectionAnchorId) {
      const range = rangeIds(visibleOrderRef.current, selectionAnchorId, id);
      setSelectedIds(new Set(range));
      return;
    }

    if (isToggleModifier(e)) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setSelectionAnchorId(id);
      return;
    }

    setSelectedIds((prev) => {
      if (prev.size === 1 && prev.has(id)) return new Set();
      return new Set([id]);
    });
    setSelectionAnchorId(id);
  }

  function onSelectUnifiedInstance(instanceId: string) {
    setContextMenu(null);
    setSelectedIds((prev) => {
      if (prev.size === 1 && prev.has(instanceId)) return new Set();
      return new Set([instanceId]);
    });
    setSelectionAnchorId(instanceId);
  }

  function onCardContextMenu(card: CardView, e: MouseEvent) {
    setSelectedIds((prev) => {
      if (prev.has(card.instanceId)) return prev;
      if (prev.size > 1) {
        const next = new Set(prev);
        next.add(card.instanceId);
        return next;
      }
      return new Set([card.instanceId]);
    });
    setSelectionAnchorId(card.instanceId);
    setContextMenu({ x: e.clientX, y: e.clientY, instanceId: card.instanceId });
  }

  const selectionIdList = useMemo(() => [...selectedIds], [selectedIds]);

  function onToggleFoil() {
    if (!selectionCount) return;
    const anyNonFoil = selectedCards.some((c) => !c.foil);
    commit(setCardsFoil(deckRef.current, selectionIdList, anyNonFoil));
  }

  function onToggleProxy() {
    if (!selectionCount) return;
    const anyNonProxy = selectedCards.some((c) => !c.proxy);
    commit(setCardsProxy(deckRef.current, selectionIdList, anyNonProxy));
  }

  function onMoveToDefault() {
    if (!selectionCount) return;
    commit(moveCardsToDefaultCategories(deckRef.current, selectionIdList));
  }

  function onAddToSwapQueue() {
    if (!selectionCount) return;
    commit(queueCardsAsOut(deckRef.current, selectionIdList));
  }

  function setViewAndPersist(next: BrowseView) {
    setView(next);
    if (deckRef.current.browseViewDefault !== next) {
      commitPatch({ browseViewDefault: next });
    }
  }

  function setLayoutAndPersist(next: CardLayout) {
    setLayout(next);
    if (deckRef.current.cardLayoutDefault !== next) {
      commitPatch({ cardLayoutDefault: next });
    }
  }

  function setCardSortAndPersist(next: CardSortMode) {
    setCardSort(next);
    if (deckRef.current.cardSortDefault !== next) {
      commitPatch({ cardSortDefault: next });
    }
  }

  function onDropCard(
    instanceId: string,
    category: string,
    opts?: { commanderSlot?: 0 | 1 },
  ) {
    const current = deckRef.current;
    const card = current.cards.find((c) => c.instanceId === instanceId);
    if (!card) return;

    if (category === 'Commander' && opts?.commanderSlot != null) {
      commitPatch({
        cards: placeCardInCommanderSlot(current.cards, instanceId, opts.commanderSlot),
      });
      return;
    }

    if (card.primaryCategory === category) return;
    commitPatch({
      cards: moveCardCategory(current.cards, instanceId, category, card.stack),
      categories: ensureCategoryDef(current.categories || [], category),
    });
  }

  function clearSwapEdit() {
    setDraft(null);
  }

  function saveSwapEdit() {
    if (!draft) return;
    const current = deckRef.current;
    const entries = [...current.formalSwapEntries]
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((e, i) =>
        e.id === draft.entryId
          ? {
              ...e,
              inInstanceId: draft.inInstanceId,
              outInstanceId: draft.outInstanceId,
              inTargetCategory: draft.inTargetCategory,
              notes: draft.notes.trim() || null,
              sortIndex: i,
            }
          : { ...e, sortIndex: i },
      );
    commit(syncCardsWithFormalSwaps(current, entries));
    clearSwapEdit();
  }

  function removeSwapEdit() {
    if (!draft) return;
    const entries = deckRef.current.formalSwapEntries
      .filter((e) => e.id !== draft.entryId)
      .map((e, i) => ({ ...e, sortIndex: i }));
    commit(syncCardsWithFormalSwaps(deckRef.current, entries));
    clearSwapEdit();
  }

  function onAddLookingFor(printing: PrintingFields, meta?: { proxy: boolean }) {
    commit(addLookingForCard(deckRef.current, printing, meta));
  }

  function onRemoveLookingFor(entryId: string) {
    commit(removeLookingForEntry(deckRef.current, entryId));
  }

  function onAddCard(
    printing: PrintingFields,
    category: string,
    meta?: { proxy: boolean },
  ) {
    const current = deckRef.current;
    const before = new Set(current.cards.map((c) => c.instanceId));
    const next = addCardToDeck(current, printing, category, { proxy: meta?.proxy });
    const added = next.cards.find((c) => !before.has(c.instanceId));
    commit(next);
    if (added) {
      setSelectedIds(new Set([added.instanceId]));
      setSelectionAnchorId(added.instanceId);
    }
    setAddOpen(false);
  }

  function onConfirmSwapIn(
    printing: PrintingFields,
    category: string,
    meta?: { proxy: boolean },
  ) {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    const currentDeck = deckRef.current;
    const existing = findMatchingPrintingInstance(currentDeck, printing, {
      proxy: meta?.proxy,
    });
    if (existing) {
      setDraft({ ...currentDraft, inInstanceId: existing.instanceId });
      return;
    }
    const before = new Set(currentDeck.cards.map((c) => c.instanceId));
    const next = addCardToDeck(currentDeck, printing, category, { proxy: meta?.proxy });
    const added = next.cards.find((c) => !before.has(c.instanceId));
    commit(next);
    if (added) {
      setDraft({ ...currentDraft, inInstanceId: added.instanceId });
    }
  }

  function onChangePrinting(printing: PrintingFields, meta?: { proxy: boolean }) {
    if (!primarySelected || multi) return;
    commit(
      changeCardPrinting(deckRef.current, primarySelected.instanceId, printing, {
        proxy: meta?.proxy,
      }),
    );
    setPrintingOpen(false);
  }

  function onRemoveSelected() {
    if (!selectionCount) return;
    const label =
      selectionCount === 1
        ? `Remove “${selectedCards[0]!.name}” from this deck?`
        : `Remove ${selectionCount} cards from this deck?`;
    if (!window.confirm(label)) return;
    commit(removeCardsFromDeck(deckRef.current, selectionIdList));
    clearSelection();
    setMoveOpen(false);
    setPrintingOpen(false);
  }

  function onSetCover() {
    if (!primarySelected || multi) return;
    commitPatch({ coverInstanceId: primarySelected.instanceId });
  }

  function onClearCover() {
    commitPatch({ coverInstanceId: null });
  }

  const shellStyle = {
    ['--db-card-w']: `${cardWidthPx}px`,
  } as CSSProperties;

  const isCover =
    !multi &&
    primarySelected != null &&
    deck.coverInstanceId === primarySelected.instanceId;
  const foilToggleEnabled = selectedCards.some((c) => cardSupportsFoilToggle(deck, c));
  const anyFoil = selectedCards.some((c) => c.foil);
  const anyProxy = selectedCards.some((c) => c.proxy);
  const contextCard =
    contextMenu != null
      ? deck.cards.find((c) => c.instanceId === contextMenu.instanceId) || null
      : null;

  return (
    <div
      ref={shellRef}
      className={`db-shell${draft ? ' is-swap-editing' : ''}`}
      style={shellStyle}
    >
      <header className="db-header">
        <button type="button" className="db-btn db-library-back" onClick={onBack} aria-label="Library" title="Library">
          <BookIcon />
        </button>
        <ExportBar
          view={view}
          onViewChange={setViewAndPersist}
          layout={layout}
          onLayoutChange={setLayoutAndPersist}
          cardSort={cardSort}
          onCardSortChange={setCardSortAndPersist}
          cardSize={cardSize}
          onCardSizeChange={setCardSize}
          onOpenCategories={() => setCategoriesOpen(true)}
        />
        <DeckActionsMenu
          deck={deck}
          onDeckChange={(next) => {
            // Refresh replaces the doc (import preserves Hub targets); other actions patch sync time.
            if (next.cards !== deck.cards || next.categories !== deck.categories) {
              commit(next);
            } else {
              commitPatch({
                lastArchidektSyncAt: next.lastArchidektSyncAt,
              });
            }
          }}
        />
      </header>

      <div className="db-body">
        <main className="db-main">
          {selectionCount ? (
            <div className="db-selection-bar">
              <span className="db-selection-bar-count" aria-live="polite">
                {selectionCount === 1 ? '1 selected' : `${selectionCount} selected`}
              </span>
              <div className="db-selection-bar-actions">
                <button
                  type="button"
                  className={`db-btn db-foil-toggle${anyFoil ? ' is-foil' : ''}`}
                  aria-pressed={anyFoil}
                  aria-label={anyFoil ? 'Foil' : 'Not foil'}
                  title={
                    foilToggleEnabled || anyFoil
                      ? anyFoil
                        ? 'Foil — click to unmark'
                        : 'Mark as foil'
                      : 'This printing is not available in foil'
                  }
                  disabled={!foilToggleEnabled && !anyFoil}
                  onClick={onToggleFoil}
                >
                  <FoilIcon filled={anyFoil} />
                </button>
                <button
                  type="button"
                  className={`db-btn db-proxy-toggle${anyProxy ? ' is-proxy' : ''}`}
                  aria-pressed={anyProxy}
                  aria-label={anyProxy ? 'Proxy' : 'Not proxy'}
                  title={anyProxy ? 'Proxy — click to unmark' : 'Mark as proxy'}
                  onClick={onToggleProxy}
                >
                  <ProxyIcon filled={anyProxy} />
                </button>
                {!multi ? (
                  isCover ? (
                    <button type="button" className="db-btn" onClick={onClearCover}>
                      Clear cover
                    </button>
                  ) : (
                    <button type="button" className="db-btn" onClick={onSetCover}>
                      Set as cover
                    </button>
                  )
                ) : null}
                <button type="button" className="db-btn" onClick={() => setMoveOpen(true)}>
                  Move…
                </button>
                <button type="button" className="db-btn" onClick={onMoveToDefault}>
                  Move to default
                </button>
                <button type="button" className="db-btn" onClick={onAddToSwapQueue}>
                  {multi ? `Add ${selectionCount} to swap queue` : 'Add to swap queue'}
                </button>
                {!multi ? (
                  <button
                    type="button"
                    className="db-btn"
                    onClick={() => setPrintingOpen(true)}
                  >
                    Change printing…
                  </button>
                ) : null}
                <button type="button" className="db-btn db-btn-danger" onClick={onRemoveSelected}>
                  Remove
                </button>
                <button type="button" className="db-btn" onClick={clearSelection}>
                  Clear
                </button>
              </div>
            </div>
          ) : null}
          {isUnifiedListView ? (
            <UnifiedListBrowse
              deck={deck}
              onSelectInstance={onSelectUnifiedInstance}
              deckMeta={deckMeta}
              deckMetaWarn={sizeWarn || targetsVsCubeWarn}
              syncStatus={syncStatus}
            />
          ) : isColourIdentityView ? (
            <ColourIdentityBrowse
              deck={deck}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              layout={layout}
              cardSort={cardSort}
              separateLands={view === 'colour_identity_spells'}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              onVisibleOrderChange={onVisibleOrderChange}
              deckMeta={deckMeta}
              deckMetaWarn={sizeWarn || targetsVsCubeWarn}
              syncStatus={syncStatus}
            />
          ) : (
            <CategoryBrowse
              deck={deck}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              layout={layout}
              cardSort={cardSort}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              onVisibleOrderChange={onVisibleOrderChange}
              deckMeta={deckMeta}
              deckMetaWarn={sizeWarn || targetsVsCubeWarn}
              syncStatus={syncStatus}
              browseView={isCategoryBrowseView(view) ? view : 'category'}
              onEditCategory={(cat) => setEditingCategory(cat)}
            />
          )}
        </main>
        <aside className="db-aside">
          <div className="db-aside-tabs" role="tablist" aria-label="Deck side panel">
            <button
              type="button"
              role="tab"
              id="db-aside-tab-deck"
              aria-selected={asideTab === 'deck'}
              aria-controls="db-aside-panel-deck"
              className={`db-aside-tab${asideTab === 'deck' ? ' is-active' : ''}`}
              onClick={() => setAsideTab('deck')}
            >
              Deck
            </button>
            <button
              type="button"
              role="tab"
              id="db-aside-tab-profile"
              aria-selected={asideTab === 'profile'}
              aria-controls="db-aside-panel-profile"
              className={`db-aside-tab${asideTab === 'profile' ? ' is-active' : ''}`}
              onClick={() => setAsideTab('profile')}
            >
              Profile
            </button>
          </div>
          <div
            role="tabpanel"
            id="db-aside-panel-deck"
            aria-labelledby="db-aside-tab-deck"
            hidden={asideTab !== 'deck'}
            className="db-aside-panel"
          >
            <SwapQueuePanel
              deck={deck}
              onChange={(next) => {
                commit(syncCardsWithFormalSwaps(deckRef.current, next.formalSwapEntries));
              }}
              draft={draft}
              onStartEdit={(entry) => {
                setDraft(draftFromFormalEntry(entry));
              }}
              onDraftChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
              onConfirmIn={onConfirmSwapIn}
              onCancelEdit={clearSwapEdit}
              onSaveEdit={saveSwapEdit}
              onRemoveEdit={removeSwapEdit}
              onAddLookingFor={onAddLookingFor}
              onRemoveLookingFor={onRemoveLookingFor}
            />
            <CategoryBrowse
              deck={deck}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              layout="stacked"
              cardSort={cardSort}
              onDropCard={view === 'category_multi' ? undefined : onDropCard}
              onCardContextMenu={onCardContextMenu}
              onEditCategory={(cat) => setEditingCategory(cat)}
              mode="aside"
              includeSwapCategories={editingSwap}
              browseView={isCategoryBrowseView(view) ? view : 'category'}
            />
          </div>
          <div
            role="tabpanel"
            id="db-aside-panel-profile"
            aria-labelledby="db-aside-tab-profile"
            hidden={asideTab !== 'profile'}
            className="db-aside-panel"
          >
            {asideTab === 'profile' ? <DeckProfilePanel deck={deck} /> : null}
          </div>
        </aside>
      </div>

      {moveOpen && selectionCount ? (
        <MoveSheet
          deck={deck}
          cards={selectedCards}
          onClose={() => setMoveOpen(false)}
          onApply={(next) => {
            commitPatch({
              cards: next.cards,
              categories: next.categories,
            });
            setMoveOpen(false);
          }}
        />
      ) : null}

      {addOpen ? (
        <ScryfallSearchModal
          deck={deck}
          onClose={() => setAddOpen(false)}
          onAdd={onAddCard}
        />
      ) : null}

      {printingOpen && primarySelected && !multi ? (
        <PrintingPickerModal
          cardName={primarySelected.name}
          defaultScryfallId={primarySelected.scryfallId}
          selectedScryfallId={primarySelected.scryfallId}
          foilDefault={primarySelected.foil}
          proxyDefault={Boolean(primarySelected.proxy)}
          confirmLabel="Apply printing"
          title={`Printing — ${cardDisplayName(primarySelected)}`}
          onClose={() => setPrintingOpen(false)}
          onConfirm={(printing, _category, meta) => onChangePrinting(printing, meta)}
        />
      ) : null}

      {categoriesOpen ? (
        <CategorySettingsPanel
          deck={deck}
          onChange={(next) => {
            commitPatch({
              categories: next.categories,
              cubeTargetSize: next.cubeTargetSize,
            });
          }}
          onClose={() => setCategoriesOpen(false)}
          onEditCategory={(name) => {
            setCategoriesOpen(false);
            setEditingCategory(name);
          }}
          initialFocus="order"
        />
      ) : null}

      {editingCategory ? (
        <CategoryEditDialog
          deck={deck}
          categoryName={editingCategory}
          onChange={(next) => {
            commitPatch({
              categories: next.categories,
              // Only apply cards when rename rewrote memberships (same ref = no rename).
              ...(next.cards !== deck.cards ? { cards: next.cards } : {}),
            });
          }}
          onClose={() => setEditingCategory(null)}
          onOpenReorder={() => setCategoriesOpen(true)}
        />
      ) : null}

      {contextMenu && contextCard ? (
        <CardContextMenu
          state={contextMenu}
          selectionCount={selectionCount}
          isCover={deck.coverInstanceId === contextCard.instanceId}
          foil={Boolean(contextCard.foil)}
          foilEnabled={
            multi
              ? selectedCards.some((c) => cardSupportsFoilToggle(deck, c))
              : cardSupportsFoilToggle(deck, contextCard)
          }
          proxy={Boolean(contextCard.proxy)}
          secondaryCategories={secondaryCategoriesOf(contextCard)}
          categoryOptions={deckCategoryOptions(deck).filter(
            (c) =>
              c !== contextCard.primaryCategory &&
              !(contextCard.categories || []).includes(c),
          )}
          onClose={() => setContextMenu(null)}
          onToggleFoil={onToggleFoil}
          onToggleProxy={onToggleProxy}
          onSetCover={() => {
            commitPatch({ coverInstanceId: contextCard.instanceId });
          }}
          onClearCover={onClearCover}
          onMove={() => setMoveOpen(true)}
          onMoveToDefault={onMoveToDefault}
          onAddToSwapQueue={onAddToSwapQueue}
          onChangePrinting={() => setPrintingOpen(true)}
          onRemove={onRemoveSelected}
          onRemoveSecondary={(category) => {
            commitPatch({
              cards: removeSecondaryCategory(
                deckRef.current.cards,
                contextCard.instanceId,
                category,
              ),
            });
          }}
          onAddSecondary={(category) => {
            const current = deckRef.current;
            commitPatch({
              cards: addSecondaryCategory(current.cards, contextCard.instanceId, category),
              categories: ensureCategoryDef(current.categories || [], category),
            });
          }}
        />
      ) : null}

      <button
        type="button"
        className="db-add-fab"
        aria-label="Add card"
        title="Add card"
        onClick={() => setAddOpen(true)}
      >
        <span className="db-add-fab-plus" aria-hidden="true">
          +
        </span>
      </button>
    </div>
  );
}
