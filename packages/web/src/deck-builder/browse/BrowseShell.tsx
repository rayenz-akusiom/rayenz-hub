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
  cardMatchesSetMembership,
  cardMatchesSyntaxMembership,
  cardSupportsFoilToggle,
  cardIsSeekingMarked,
  categoryIncluded,
  categoryTargetsMismatchCubeSize,
  changeCardPrinting,
  deckCategoryOptions,
  deckHeaderTarget,
  deckSize,
  deckSizeMismatch,
  deckSizeTarget,
  defaultBrowseView,
  ensureCategoryDef,
  incompleteEntryCount,
  isCategoryBrowseView,
  isCommanderCategory,
  isPendragonLeaderCategory,
  isPendragonAddLegal,
  pendragonRoleForCategory,
  formatScryfallClause,
  PENDRAGON_ARTHUR,
  PENDRAGON_EXCALIBUR,
  isSeekingCategory,
  isSwapQueueCategoryName,
  MAYBEBOARD,
  toggleCardsSeeking,
  moveCardsCategory,
  moveCardsToDefaultCategories,
  placeCardInCommanderSlot,
  placeCardInUniqueHeaderSlot,
  projectLiveFormalSwaps,
  queueCardsAsOut,
  reconcileLookingForFromCards,
  removeCardsFromDeck,
  removeSecondaryCategory,
  recalculateAutoBasics,
  secondaryCategoriesOf,
  SEEKING,
  setCardsFoil,
  setCardsProxy,
  shouldRecalculateAutoBasics,
  syncCardsWithFormalSwaps,
  cancelFormalSwap,
  finalizeFormalSwap,
  upsertOracle,
  isTheoryDeck,
  type BrowseView,
  type CardView,
  type CardLayout,
  type CardSortMode,
  type DeckDocument,
  type DeckOwnership,
  type DeckVisibility,
  type PrintingFields,
  type ScryfallCard,
} from '@rayenz-hub/shared';
import { CategoryBrowse } from './CategoryBrowse';
import { CardFlagCharmProvider } from './CardFlagCharmContext';
import { ColourIdentityBrowse } from './ColourIdentityBrowse';
import { UnifiedListBrowse } from './UnifiedListBrowse';
import { AddCardFab } from './AddCardFab';
import { type ContextMenuPoint } from './CardTile';
import { useDragAutoScroll } from './useDragAutoScroll';
import { SwapQueuePanel } from '../swaps/SwapQueuePanel';
import { draftFromFormalEntry, type SwapEditDraft } from '../swaps/swap-edit-chrome';
import { findMatchingPrintingInstance } from '../swaps/swap-pickers';
import { MoveSheet } from '../edit/MoveSheet';
import { CardContextMenu, type CardContextMenuState } from '../edit/CardContextMenu';
import {
  findDeckInstanceForPickerCard,
  removeOneCopyFromDeck,
} from '../edit/card-mutations';
import { CategorySettingsPanel } from '../edit/CategorySettingsPanel';
import { CategoryEditDialog } from '../edit/CategoryEditDialog';
import { BasicLandsPanel } from '../edit/BasicLandsPanel';
import { ExportBar } from '../import-export/ExportBar';
import { DeckActionsMenu } from '../import-export/DeckActionsMenu';
import {
  GlanceGenerateButton,
  type GlanceGenerateHandle,
} from '../commander/GlanceGenerateButton';
import { useScryfallEnrich } from '../scryfall/useScryfallEnrich';
import { ScryfallSearchModal } from '../scryfall/ScryfallSearchModal';
import { PrintingPickerModal } from '../scryfall/PrintingPickerModal';
import {
  cardImageCopyUrl,
  copyCardImageToClipboard,
} from '../../lib/copy-card-image';
import { useCardSize } from '../card-size';
import { DeckProfilePanel } from '../profile/DeckProfilePanel';
import { FoilIcon } from '../../cards/FoilIcon';
import { ProxyIcon } from '../../cards/ProxyIcon';
import { SeekingIcon } from '../../cards/SeekingIcon';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';
import { useSetMembershipFilter } from '../ui/SetFilterControl';
import { useScryfallSyntaxFilter } from '../ui/SyntaxFilterControl';
import {
  cardMatchesFlagFilter,
  FLAG_FILTER_MODE_LABELS,
  type FlagFilterMode,
} from '../ui/FlagFilterControl';
import { ActiveFilterChips, type ActiveFilterChip } from '../ui/ActiveFilterChips';
import { useDeckEditHistory } from '../useDeckEditHistory';
import { loadCardCharmsPref, saveCardCharmsPref } from '../card-charms-pref';
import { HubProgress, type HubProgressController } from '../../lib/hub-progress';
import { navigateHub } from '../../lib/hub-storage';
import {
  builderHash,
  hubUserSlug,
  parseBuilderRoute,
  pathFromHash,
  swapQueuePairHash,
  type BuilderFormat,
} from '../../hub/routes';

/** Main / Seeking / Queued — still confirm before Remove. */
function removeNeedsConfirm(
  deck: DeckDocument,
  cards: { primaryCategory?: string | null }[],
): boolean {
  return cards.some((c) => {
    const primary = c.primaryCategory || 'Other';
    if (isSwapQueueCategoryName(primary) || isSeekingCategory(primary)) return true;
    return categoryIncluded(deck.categories || [], primary);
  });
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

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

type TrimEffect = 'maybeboard' | 'delete';

function isTrimProtectedSlot(primaryCategory: string | null | undefined): boolean {
  return isCommanderCategory(primaryCategory) || isPendragonLeaderCategory(primaryCategory);
}

function overlayDialogOpen(): boolean {
  return Boolean(document.querySelector('.db-modal, .hub-picker-dialog'));
}

function builderFormatFromLocation(): BuilderFormat {
  return pathFromHash() === '/cube-builder' ? 'cube' : 'commander';
}

function writeBuilderPairHash(entryId: string | null) {
  const route = parseBuilderRoute(window.location.hash);
  if (!route) return;
  navigateHub(builderHash(builderFormatFromLocation(), route.userSlug, route.deckSlug, entryId));
}

export function BrowseShell({
  deck,
  onChange,
  onBack,
  syncStatus = null,
  readOnly = false,
  onDuplicate,
  duplicateDisabled = false,
  focusPairEntryId = null,
}: {
  deck: DeckDocument;
  onChange: (next: DeckDocument) => void;
  onBack: () => void;
  syncStatus?: DeckSyncStatus | null;
  readOnly?: boolean;
  onDuplicate?: (deck: DeckDocument) => void;
  duplicateDisabled?: boolean;
  /** Formal swap entry to open when the deck loads. */
  focusPairEntryId?: string | null;
}) {
  const [view, setView] = useState<BrowseView>(
    deck.browseViewDefault || defaultBrowseView(deck.format),
  );
  const [layout, setLayout] = useState<CardLayout>(deck.cardLayoutDefault || 'stacked');
  const [cardSort, setCardSort] = useState<CardSortMode>(deck.cardSortDefault || 'name_asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [mainVisibleOrder, setMainVisibleOrder] = useState<string[]>([]);
  const [asideVisibleOrder, setAsideVisibleOrder] = useState<string[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCreatingNew, setMoveCreatingNew] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pickSlotCategory, setPickSlotCategory] = useState<string | null>(null);
  const [printingOpen, setPrintingOpen] = useState(false);
  const [draft, setDraft] = useState<SwapEditDraft | null>(null);
  const [asideTab, setAsideTab] = useState<'deck' | 'profile'>('deck');
  const [contextMenu, setContextMenu] = useState<CardContextMenuState | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [basicsOpen, setBasicsOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [trimMode, setTrimMode] = useState(false);
  const [trimEffect, setTrimEffect] = useState<TrimEffect>('maybeboard');
  const { size: cardSize, setSize: setCardSize, widthPx: cardWidthPx } = useCardSize();
  const setFilter = useSetMembershipFilter();
  const [proxyFilter, setProxyFilter] = useState<FlagFilterMode>('all');
  const [foilFilter, setFoilFilter] = useState<FlagFilterMode>('all');
  const [seekingFilter, setSeekingFilter] = useState<FlagFilterMode>('all');
  const [cardCharmsEnabled, setCardCharmsEnabled] = useState(
    () => loadCardCharmsPref().enabled,
  );
  const [seekingStatus, setSeekingStatus] = useState<string | null>(null);
  const [seekingCountPulse, setSeekingCountPulse] = useState(false);
  useDragAutoScroll();
  const shellRef = useRef<HTMLDivElement>(null);
  const progressHostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HubProgressController | null>(null);
  const glanceOpenRef = useRef<GlanceGenerateHandle | null>(null);
  const cardSizeReady = useRef(false);
  const removeSelectedRef = useRef<() => void>(() => {});
  const toggleSeekingRef = useRef<() => void>(() => {});
  const consumedPairRef = useRef<string | null>(null);
  /** True once size was over target while this trim session was active (for auto-exit). */
  const trimWasOverRef = useRef(false);
  const visibleOrder = useMemo(
    () => [...mainVisibleOrder, ...asideVisibleOrder],
    [mainVisibleOrder, asideVisibleOrder],
  );
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

  useEffect(() => {
    if (progressHostRef.current && !progressRef.current) {
      progressRef.current = HubProgress.mount(progressHostRef.current);
    }
  }, []);

  const liveDeck = useMemo(() => projectLiveFormalSwaps(deck), [deck]);

  const syntaxCards = useMemo(
    () => liveDeck.cards.map((c) => ({ name: c.name, scryfallId: c.scryfallId })),
    [liveDeck.cards],
  );
  const syntaxFilter = useScryfallSyntaxFilter(syntaxCards);

  const selectedCards = useMemo(
    () => liveDeck.cards.filter((c) => selectedIds.has(c.instanceId)),
    [liveDeck.cards, selectedIds],
  );
  const selectionCount = selectedCards.length;
  const multi = selectionCount > 1;
  const primarySelected = selectedCards[0] || null;

  /** Browse-only view with set / syntax / proxy / foil filters; mutations still use full `liveDeck`. */
  const browseDeck = useMemo((): DeckDocument => {
    const setActive = setFilter.active && setFilter.membership;
    const membership = setFilter.membership;
    const syntaxActive = syntaxFilter.active;
    const syntaxMembership = syntaxFilter.membership;
    const flagActive = proxyFilter !== 'all' || foilFilter !== 'all' || seekingFilter !== 'all';
    if (!setActive && !syntaxActive && !flagActive) return liveDeck;
    return {
      ...liveDeck,
      cards: liveDeck.cards.filter((c) => {
        if (setActive && membership && !cardMatchesSetMembership(c.name, membership)) {
          return false;
        }
        if (syntaxActive && !cardMatchesSyntaxMembership(c.name, syntaxMembership)) {
          return false;
        }
        if (!cardMatchesFlagFilter(Boolean(c.proxy), proxyFilter)) return false;
        if (!cardMatchesFlagFilter(Boolean(c.foil), foilFilter)) return false;
        if (!cardMatchesFlagFilter(cardIsSeekingMarked(c), seekingFilter)) return false;
        return true;
      }),
    };
  }, [
    liveDeck,
    setFilter.active,
    setFilter.membership,
    syntaxFilter.active,
    syntaxFilter.membership,
    proxyFilter,
    foilFilter,
    seekingFilter,
  ]);

  const incomplete = incompleteEntryCount(liveDeck.formalSwapEntries);
  const size = deckSize(liveDeck);
  const queuesReadOnly = isTheoryDeck(liveDeck) || readOnly;

  const deckRef = useRef(liveDeck);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const swapAutosaveTimer = useRef(0);
  /** First draft autosave records history; later debounce ticks skip. */
  const swapDraftHistoryRecorded = useRef(false);
  const editHistory = useDeckEditHistory();

  useEffect(() => {
    function tryOpenPair() {
      const id =
        focusPairEntryId || parseBuilderRoute(window.location.hash)?.pairEntryId || null;
      if (!id || consumedPairRef.current === id) return;
      const entry = liveDeck.formalSwapEntries.find((e) => e.id === id);
      if (!entry) return;
      consumedPairRef.current = id;
      setAsideTab('deck');
      if (readOnly) return;
      swapDraftHistoryRecorded.current = false;
      setDraft(draftFromFormalEntry(entry));
    }
    tryOpenPair();
    window.addEventListener('hashchange', tryOpenPair);
    return () => window.removeEventListener('hashchange', tryOpenPair);
  }, [focusPairEntryId, liveDeck.formalSwapEntries, readOnly]);

  type CommitOpts = { recordHistory?: boolean };

  /** Apply a full document; keeps deckRef ahead of React props so rapid edits don't clobber each other. */
  const commit = useCallback(
    (next: DeckDocument, opts?: CommitOpts) => {
      if (readOnly) return;
      let doc = next;
      if (shouldRecalculateAutoBasics(deckRef.current, doc)) {
        doc = recalculateAutoBasics(doc);
      }
      if (opts?.recordHistory !== false) {
        editHistory.recordBefore(deckRef.current);
      }
      deckRef.current = doc;
      onChange(doc);
    },
    [onChange, editHistory, readOnly],
  );

  /** Merge a patch onto the latest known deck (avoids stale prop spreads). */
  const commitPatch = useCallback(
    (patch: Partial<DeckDocument>, opts?: CommitOpts) => {
      commit(
        {
          ...deckRef.current,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
        opts,
      );
    },
    [commit],
  );

  // Adopt parent deck when switching decks or when parent has equal/newer data.
  useEffect(() => {
    const local = deckRef.current;
    if (deck.deckId !== local.deckId) {
      deckRef.current = liveDeck;
      editHistory.clear();
      setView(liveDeck.browseViewDefault || defaultBrowseView(liveDeck.format));
      setLayout(liveDeck.cardLayoutDefault || 'stacked');
      setCardSort(liveDeck.cardSortDefault || 'name_asc');
      setSelectedIds(new Set());
      setSelectionAnchorId(null);
      setTrimMode(false);
      setTrimEffect('maybeboard');
      return;
    }
    if (deck.updatedAt >= local.updatedAt) {
      deckRef.current = liveDeck;
    }
  }, [deck, liveDeck, editHistory]);

  // Ensure Seeking category def exists so aside flags / deck size stay correct.
  useEffect(() => {
    const current = deckRef.current;
    const cats = current.categories || [];
    if (cats.some((c) => c.name === SEEKING)) return;
    commit(
      {
        ...current,
        categories: ensureCategoryDef(cats, SEEKING),
      },
      { recordHistory: false },
    );
  }, [liveDeck.deckId, liveDeck.categories, commit]);

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
      commit(
        {
          ...latest,
          cards: mergedCards,
          oracle: mergedOracle,
          updatedAt: new Date().toISOString(),
        },
        { recordHistory: false },
      );
    },
    [commit],
  );

  const isColourIdentityView =
    view === 'colour_identity' || view === 'colour_identity_spells';
  const isUnifiedListView = view === 'unified_list';
  // Enrich CI/type/leader keywords when missing; Archidekt imports already have layout defaults.
  const { enriching } = useScryfallEnrich(liveDeck, true, onEnrichPatch);

  const headerTarget = deckHeaderTarget(liveDeck);
  const sizeTarget = deckSizeTarget(liveDeck);
  const sizeWarn = deckSizeMismatch(liveDeck);
  const targetsVsCubeWarn = categoryTargetsMismatchCubeSize(liveDeck);
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
  const trimOver =
    sizeTarget != null && size > sizeTarget ? size - sizeTarget : 0;

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionAnchorId(null);
    setContextMenu(null);
  }, []);

  const exitTrim = useCallback(() => {
    trimWasOverRef.current = false;
    setTrimMode(false);
    setTrimEffect('maybeboard');
  }, []);

  const enterTrim = useCallback(() => {
    clearSelection();
    setTrimEffect('maybeboard');
    setTrimMode(true);
  }, [clearSelection]);

  // Exit trim after reducing from over target to at/below; allow enter at legal size.
  useEffect(() => {
    if (!trimMode || sizeTarget == null) {
      trimWasOverRef.current = false;
      return;
    }
    if (size > sizeTarget) {
      trimWasOverRef.current = true;
      return;
    }
    if (trimWasOverRef.current) {
      exitTrim();
    }
  }, [trimMode, size, sizeTarget, exitTrim]);

  const overlayBlocksShortcuts =
    moveOpen ||
    printingOpen ||
    addOpen ||
    categoriesOpen ||
    basicsOpen ||
    editingCategory ||
    contextMenu;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (overlayBlocksShortcuts) return;
      if (overlayDialogOpen()) return;
      if (isEditableKeyboardTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const prev = editHistory.undo(deckRef.current);
        if (!prev) return;
        commit(prev, { recordHistory: false });
        clearSelection();
        return;
      }
      if (mod && ((key === 'z' && e.shiftKey) || key === 'y')) {
        e.preventDefault();
        const next = editHistory.redo(deckRef.current);
        if (!next) return;
        commit(next, { recordHistory: false });
        clearSelection();
        return;
      }

      if (!mod && !readOnly && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        if (trimMode) exitTrim();
        else enterTrim();
        return;
      }
      if (
        !mod &&
        !readOnly &&
        !trimMode &&
        selectedIds.size &&
        (e.key === 'Delete' || e.key === 'Backspace')
      ) {
        e.preventDefault();
        removeSelectedRef.current();
        return;
      }
      if (
        !mod &&
        !readOnly &&
        !queuesReadOnly &&
        !trimMode &&
        selectedIds.size &&
        key === 's'
      ) {
        e.preventDefault();
        toggleSeekingRef.current();
        return;
      }

      if (e.key !== 'Escape') return;
      if (trimMode) {
        exitTrim();
        return;
      }
      if (selectedIds.size) clearSelection();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    selectedIds.size,
    trimMode,
    clearSelection,
    exitTrim,
    overlayBlocksShortcuts,
    commit,
    editHistory,
    readOnly,
    enterTrim,
    queuesReadOnly,
  ]);

  // Drop selection entries that no longer exist on the deck.
  useEffect(() => {
    const live = new Set(liveDeck.cards.map((c) => c.instanceId));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [liveDeck.cards]);

  const onMainVisibleOrderChange = useCallback((ids: string[]) => {
    setMainVisibleOrder((prev) => {
      if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) {
        return prev;
      }
      return ids;
    });
  }, []);

  const onAsideVisibleOrderChange = useCallback((ids: string[]) => {
    setAsideVisibleOrder((prev) => {
      if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) {
        return prev;
      }
      return ids;
    });
  }, []);

  function applyTrimToInstance(instanceId: string) {
    const current = deckRef.current;
    const card = current.cards.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (isTrimProtectedSlot(card.primaryCategory)) return;
    if (trimEffect === 'maybeboard') {
      if (card.primaryCategory === MAYBEBOARD) return;
      commit(moveCardsCategory(current, [instanceId], MAYBEBOARD));
      return;
    }
    commit(removeCardsFromDeck(current, [instanceId]));
  }

  function onSelectCard(card: CardView, e?: MouseEvent | ReactKeyboardEvent) {
    setContextMenu(null);
    if (trimMode && !readOnly) {
      applyTrimToInstance(card.instanceId);
      return;
    }
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
    if (trimMode && !readOnly) {
      applyTrimToInstance(instanceId);
      return;
    }
    setSelectedIds((prev) => {
      if (prev.size === 1 && prev.has(instanceId)) return new Set();
      return new Set([instanceId]);
    });
    setSelectionAnchorId(instanceId);
  }

  function openCardContextMenu(
    card: CardView,
    x: number,
    y: number,
    opts?: { replaceSelection?: boolean },
  ) {
    if (opts?.replaceSelection) {
      setSelectedIds(new Set([card.instanceId]));
    } else {
      setSelectedIds((prev) => {
        if (prev.has(card.instanceId)) return prev;
        if (prev.size > 1) {
          const next = new Set(prev);
          next.add(card.instanceId);
          return next;
        }
        return new Set([card.instanceId]);
      });
    }
    setSelectionAnchorId(card.instanceId);
    setContextMenu({ x, y, instanceId: card.instanceId });
  }

  function onCardContextMenu(card: CardView, at: MouseEvent | ContextMenuPoint) {
    if ('preventDefault' in at && typeof at.preventDefault === 'function') {
      at.preventDefault();
    }
    openCardContextMenu(card, at.clientX, at.clientY);
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

  function onToggleSeekingFor(instanceIds: string[]) {
    if (queuesReadOnly || !instanceIds.length) return;
    commit(toggleCardsSeeking(deckRef.current, instanceIds));
  }

  function onToggleSeeking() {
    if (!selectionCount) return;
    onToggleSeekingFor(selectionIdList);
  }

  function resolveCharmTargetIds(card: CardView): string[] {
    if (selectedIds.has(card.instanceId) && selectedIds.size > 1) {
      return selectionIdList;
    }
    return [card.instanceId];
  }

  function onToggleFoilFor(instanceIds: string[]) {
    if (!instanceIds.length) return;
    const cards = instanceIds
      .map((id) => deckRef.current.cards.find((c) => c.instanceId === id))
      .filter(Boolean) as CardView[];
    const anyNonFoil = cards.some((c) => !c.foil);
    commit(setCardsFoil(deckRef.current, instanceIds, anyNonFoil));
  }

  function onToggleProxyFor(instanceIds: string[]) {
    if (!instanceIds.length) return;
    const cards = instanceIds
      .map((id) => deckRef.current.cards.find((c) => c.instanceId === id))
      .filter(Boolean) as CardView[];
    const anyNonProxy = cards.some((c) => !c.proxy);
    commit(setCardsProxy(deckRef.current, instanceIds, anyNonProxy));
  }

  function onMoveToDefault() {
    if (!selectionCount) return;
    commit(moveCardsToDefaultCategories(deckRef.current, selectionIdList));
  }

  function onAddToSwapQueue() {
    if (queuesReadOnly || !selectionCount) return;
    commit(queueCardsAsOut(deckRef.current, selectionIdList));
  }

  function pulseSeekingCount() {
    setSeekingCountPulse(true);
    window.setTimeout(() => setSeekingCountPulse(false), 650);
  }

  function onMarkMainDeckSeeking() {
    if (queuesReadOnly) return;
    const before = new Set(
      (deckRef.current.cards || []).filter((c) => cardIsSeekingMarked(c)).map((c) => c.instanceId),
    );
    const next = markMainDeckSeekingSecondary(deckRef.current);
    const after = new Set(
      (next.cards || []).filter((c) => cardIsSeekingMarked(c)).map((c) => c.instanceId),
    );
    let marked = 0;
    for (const id of after) {
      if (!before.has(id)) marked += 1;
    }
    commit(next);
    if (marked > 0) {
      setSeekingStatus(`Marked ${marked} card${marked === 1 ? '' : 's'} Seeking`);
      pulseSeekingCount();
    } else {
      setSeekingStatus('Main deck already marked Seeking');
    }
  }

  useEffect(() => {
    if (!seekingStatus) return;
    const t = window.setTimeout(() => setSeekingStatus(null), 4000);
    return () => window.clearTimeout(t);
  }, [seekingStatus]);

  function onSetOwnership(ownership: DeckOwnership) {
    commitPatch({ ownership });
  }

  function onSetVisibility(visibility: DeckVisibility) {
    commitPatch({ visibility });
  }

  function setViewAndPersist(next: BrowseView) {
    setView(next);
    if (deckRef.current.browseViewDefault !== next) {
      commitPatch({ browseViewDefault: next }, { recordHistory: false });
    }
  }

  function setLayoutAndPersist(next: CardLayout) {
    setLayout(next);
    if (deckRef.current.cardLayoutDefault !== next) {
      commitPatch({ cardLayoutDefault: next }, { recordHistory: false });
    }
  }

  function setCardSortAndPersist(next: CardSortMode) {
    setCardSort(next);
    if (deckRef.current.cardSortDefault !== next) {
      commitPatch({ cardSortDefault: next }, { recordHistory: false });
    }
  }

  function onDropCard(
    instanceIds: string[],
    category: string,
    opts?: { commanderSlot?: 0 | 1 },
  ) {
    const current = deckRef.current;
    const ids = instanceIds.filter(Boolean);
    if (!ids.length) return;

    if (category === 'Commander' && opts?.commanderSlot != null) {
      const instanceId = ids[0]!;
      commitPatch({
        cards: placeCardInCommanderSlot(current.cards, instanceId, opts.commanderSlot),
      });
      return;
    }

    if (
      (category === PENDRAGON_ARTHUR || category === PENDRAGON_EXCALIBUR) &&
      ids.length === 1
    ) {
      const instanceId = ids[0]!;
      commitPatch({
        cards: placeCardInUniqueHeaderSlot(current.cards, instanceId, category),
        categories: ensureCategoryDef(current.categories || [], category),
      });
      return;
    }

    if (category === 'Commander' && opts?.commanderSlot == null && ids.length === 1) {
      const instanceId = ids[0]!;
      const card = current.cards.find((c) => c.instanceId === instanceId);
      if (card && card.primaryCategory === 'Commander') {
        if (current.coverInstanceId !== instanceId) {
          commitPatch({ coverInstanceId: instanceId });
        }
        return;
      }
    }

    const toMove = ids.filter((id) => {
      const card = current.cards.find((c) => c.instanceId === id);
      return Boolean(card && card.primaryCategory !== category);
    });
    if (!toMove.length) return;

    const stack = current.cards.find((c) => c.instanceId === toMove[0])?.stack ?? null;
    commit(moveCardsCategory(current, toMove, category, stack));
  }

  function clearSwapEdit() {
    window.clearTimeout(swapAutosaveTimer.current);
    swapDraftHistoryRecorded.current = false;
    consumedPairRef.current = null;
    setDraft(null);
    writeBuilderPairHash(null);
  }

  function persistSwapDraft(currentDraft: SwapEditDraft) {
    const current = deckRef.current;
    const entries = [...current.formalSwapEntries]
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((e, i) =>
        e.id === currentDraft.entryId
          ? {
              ...e,
              inInstanceId: currentDraft.inInstanceId,
              outInstanceId: currentDraft.outInstanceId,
              inTargetCategory: currentDraft.inTargetCategory,
              notes: currentDraft.notes.trim() || null,
              sortIndex: i,
            }
          : { ...e, sortIndex: i },
      );
    const recordHistory = !swapDraftHistoryRecorded.current;
    commit(syncCardsWithFormalSwaps(current, entries), { recordHistory });
    swapDraftHistoryRecorded.current = true;
  }

  function patchSwapDraft(patch: Partial<SwapEditDraft>) {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      draftRef.current = next;
      window.clearTimeout(swapAutosaveTimer.current);
      swapAutosaveTimer.current = window.setTimeout(() => {
        persistSwapDraft(next);
      }, 300);
      return next;
    });
  }

  function flushSwapAutosave() {
    window.clearTimeout(swapAutosaveTimer.current);
    const currentDraft = draftRef.current;
    if (currentDraft) persistSwapDraft(currentDraft);
  }

  function removeSwapEdit() {
    flushSwapAutosave();
    if (!draftRef.current) return;
    const currentDraft = draftRef.current;
    commit(cancelFormalSwap(deckRef.current, currentDraft.entryId));
    clearSwapEdit();
  }

  function finalizeSwapEdit() {
    flushSwapAutosave();
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    if (!currentDraft.inInstanceId || !currentDraft.outInstanceId) return;
    const current = deckRef.current;
    const entries = [...current.formalSwapEntries]
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((e, i) =>
        e.id === currentDraft.entryId
          ? {
              ...e,
              inInstanceId: currentDraft.inInstanceId,
              outInstanceId: currentDraft.outInstanceId,
              inTargetCategory: currentDraft.inTargetCategory,
              notes: currentDraft.notes.trim() || null,
              sortIndex: i,
            }
          : { ...e, sortIndex: i },
      );
    const staged = syncCardsWithFormalSwaps(current, entries);
    const done = finalizeFormalSwap(staged, currentDraft.entryId);
    if (!done) return;
    commit(done);
    clearSwapEdit();
  }

  function onAddCard(
    printing: PrintingFields,
    category: string,
    meta?: { proxy: boolean; keepOpen?: boolean },
  ) {
    const current = deckRef.current;
    if (current.format === 'pendragon' && !isPendragonAddLegal(category, {
      typeLine: printing.typeLine,
      hasCommonPrinting: printing.hasCommonPrinting,
    })) {
      return;
    }
    const before = new Set(current.cards.map((c) => c.instanceId));
    let next = addCardToDeck(current, printing, category, { proxy: meta?.proxy });
    if (category === PENDRAGON_ARTHUR || category === PENDRAGON_EXCALIBUR) {
      const added = next.cards.find((c) => !before.has(c.instanceId));
      if (added) {
        next = {
          ...next,
          cards: placeCardInUniqueHeaderSlot(next.cards, added.instanceId, category),
        };
      }
    }
    const added = next.cards.find((c) => !before.has(c.instanceId));
    commit(next);
    if (added) {
      setSelectedIds(new Set([added.instanceId]));
      setSelectionAnchorId(added.instanceId);
    }
    if (!meta?.keepOpen) {
      setAddOpen(false);
      setPickSlotCategory(null);
    }
  }

  function onRemoveInDeckCardFromPicker(card: ScryfallCard) {
    const next = removeOneCopyFromDeck(deckRef.current, {
      name: card.name,
      scryfallId: card.id,
    });
    if (next === deckRef.current) return;
    commit(next);
  }

  function onInDeckContextMenuFromPicker(
    card: ScryfallCard,
    pos: { x: number; y: number },
  ) {
    const inst = findDeckInstanceForPickerCard(deckRef.current, {
      name: card.name,
      scryfallId: card.id,
    });
    if (!inst) return;
    openCardContextMenu(inst, pos.x, pos.y, { replaceSelection: true });
  }

  function onConfirmSwapIn(
    printing: PrintingFields,
    category: string,
    meta?: { proxy: boolean },
  ) {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    const currentDeck = deckRef.current;
    const excludeOutIds = new Set(
      (currentDeck.formalSwapEntries || [])
        .map((e) => e.outInstanceId)
        .filter((id): id is string => Boolean(id)),
    );
    if (currentDraft.outInstanceId) excludeOutIds.add(currentDraft.outInstanceId);
    const existing = findMatchingPrintingInstance(currentDeck, printing, {
      proxy: meta?.proxy,
      excludeInstanceIds: excludeOutIds,
    });
    if (existing) {
      patchSwapDraft({
        inInstanceId: existing.instanceId,
        inTargetCategory: category,
      });
      return;
    }
    const before = new Set(currentDeck.cards.map((c) => c.instanceId));
    const next = addCardToDeck(currentDeck, printing, category, { proxy: meta?.proxy });
    const added = next.cards.find((c) => !before.has(c.instanceId));
    commit(next);
    if (added) {
      patchSwapDraft({
        inInstanceId: added.instanceId,
        inTargetCategory: category,
      });
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
    if (removeNeedsConfirm(deckRef.current, selectedCards) && !window.confirm(label)) {
      return;
    }
    commit(removeCardsFromDeck(deckRef.current, selectionIdList));
    clearSelection();
    setMoveOpen(false);
    setPrintingOpen(false);
  }
  removeSelectedRef.current = onRemoveSelected;

  function onClearCover() {
    commitPatch({ coverInstanceId: null });
  }

  const shellStyle = {
    ['--db-card-w']: `${cardWidthPx}px`,
  } as CSSProperties;

  removeSelectedRef.current = onRemoveSelected;
  toggleSeekingRef.current = onToggleSeeking;

  const foilToggleEnabled = selectedCards.some((c) => cardSupportsFoilToggle(liveDeck, c));
  const anyFoil = selectedCards.some((c) => c.foil);
  const anyProxy = selectedCards.some((c) => c.proxy);
  const anySeeking = selectedCards.some((c) => cardIsSeekingMarked(c));
  const contextCard =
    contextMenu != null
      ? liveDeck.cards.find((c) => c.instanceId === contextMenu.instanceId) || null
      : null;

  const showGlance = liveDeck.format === 'commander' || liveDeck.format === 'pendragon';
  const filterChips: ActiveFilterChip[] = [];
  if (syntaxFilter.active && syntaxFilter.label) {
    filterChips.push({
      id: 'syntax',
      label: syntaxFilter.label,
      onDismiss: () => syntaxFilter.clear(),
    });
  }
  if (setFilter.active && setFilter.label) {
    filterChips.push({
      id: 'set',
      label: setFilter.label,
      onDismiss: () => setFilter.clear(),
    });
  }
  if (proxyFilter !== 'all') {
    filterChips.push({
      id: 'proxy',
      label: `Proxy ${FLAG_FILTER_MODE_LABELS[proxyFilter]}`,
      onDismiss: () => setProxyFilter('all'),
    });
  }
  if (foilFilter !== 'all') {
    filterChips.push({
      id: 'foil',
      label: `Foil ${FLAG_FILTER_MODE_LABELS[foilFilter]}`,
      onDismiss: () => setFoilFilter('all'),
    });
  }
  if (seekingFilter !== 'all') {
    filterChips.push({
      id: 'seeking',
      label: `Seeking ${FLAG_FILTER_MODE_LABELS[seekingFilter]}`,
      onDismiss: () => setSeekingFilter('all'),
    });
  }

  const cardFlagCharmValue = useMemo(
    () => ({
      enabled: cardCharmsEnabled,
      readOnly,
      queuesReadOnly,
      deck: liveDeck,
      selectedIds,
      resolveTargetIds: resolveCharmTargetIds,
      onToggleFoil: onToggleFoilFor,
      onToggleProxy: onToggleProxyFor,
      onToggleSeeking: onToggleSeekingFor,
    }),
    [
      cardCharmsEnabled,
      readOnly,
      queuesReadOnly,
      liveDeck,
      selectedIds,
      selectionIdList,
    ],
  );

  return (
    <div
      ref={shellRef}
      className={`db-shell${draft ? ' is-swap-editing' : ''}${trimMode ? ' is-trimming' : ''}${trimMode && trimEffect === 'delete' ? ' is-trim-delete' : ''}`}
      style={shellStyle}
    >
      <div className="hub-sticky-chrome">
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
          />
          {readOnly ? null : (
            <DeckActionsMenu
              deck={liveDeck}
              onDeckChange={(next) => {
                // Refresh replaces the doc (import preserves Hub targets); other actions patch sync time.
                if (next.cards !== liveDeck.cards || next.categories !== liveDeck.categories) {
                  commit(next);
                } else {
                  commitPatch({
                    lastArchidektSyncAt: next.lastArchidektSyncAt,
                  });
                }
              }}
              onDuplicate={onDuplicate ? () => onDuplicate(liveDeck) : undefined}
              duplicateDisabled={duplicateDisabled}
              onOpenCategories={() => setCategoriesOpen(true)}
              onOpenBasics={() => setBasicsOpen(true)}
              trimMode={trimMode}
              onToggleTrim={() => (trimMode ? exitTrim() : enterTrim())}
              onGenerateGlance={showGlance ? () => glanceOpenRef.current?.open() : undefined}
            />
          )}
          {showGlance && !readOnly ? (
            <GlanceGenerateButton deck={liveDeck} hideTrigger openRef={glanceOpenRef} />
          ) : null}
        </header>
        <div className="hub-progress-host" ref={progressHostRef} id="db-progress-host" />
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
        {seekingStatus ? (
          <p className="hub-muted" aria-live="polite">
            {seekingStatus}
          </p>
        ) : null}
        {(trimMode || selectionCount > 0) && !readOnly ? (
          <p className="hub-muted hub-shortcut-hint">
            {trimMode
              ? 'Trim mode · Esc exit'
              : queuesReadOnly
                ? 'Esc clear · Del remove · T trim'
                : 'Esc clear · Del remove · T trim · S seeking'}
          </p>
        ) : !readOnly ? (
          <p className="hub-muted hub-shortcut-hint hub-touch-only-hint">Long-press a card for menu</p>
        ) : null}
      </div>

      <div className="db-body">
        <CardFlagCharmProvider value={cardFlagCharmValue}>
        <main className="db-main">
          {trimMode && !readOnly ? (
            <div
              className={`db-selection-bar is-pick${trimEffect === 'delete' ? ' is-trim-delete' : ''}`}
            >
              <span className="db-selection-bar-count" aria-live="polite">
                {(() => {
                  const action =
                    trimEffect === 'delete'
                      ? 'click a card to delete it'
                      : 'click a card to move it to Maybeboard';
                  if (trimOver > 0) {
                    return `Trim mode · ${trimOver} over — ${action}`;
                  }
                  return `Trim mode — ${action}`;
                })()}
              </span>
              <div className="db-selection-bar-actions">
                <button
                  type="button"
                  className={`db-btn${trimEffect === 'maybeboard' ? ' is-active' : ''}`}
                  aria-pressed={trimEffect === 'maybeboard'}
                  onClick={() => setTrimEffect('maybeboard')}
                >
                  Maybeboard
                </button>
                <button
                  type="button"
                  className={`db-btn db-btn-danger${trimEffect === 'delete' ? ' is-active' : ''}`}
                  aria-pressed={trimEffect === 'delete'}
                  onClick={() => setTrimEffect('delete')}
                >
                  Delete
                </button>
                <button type="button" className="db-btn" onClick={exitTrim}>
                  Done
                </button>
              </div>
            </div>
          ) : selectionCount && !readOnly ? (
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
                {!queuesReadOnly ? (
                  <button
                    type="button"
                    className={`db-btn db-seeking-toggle${anySeeking ? ' is-seeking' : ''}`}
                    aria-pressed={anySeeking}
                    aria-label={anySeeking ? 'Seeking' : 'Not seeking'}
                    title={anySeeking ? 'Seeking — click to unmark' : 'Mark as seeking'}
                    onClick={onToggleSeeking}
                  >
                    <SeekingIcon filled={anySeeking} />
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
          {setFilter.error ? <p className="hub-warn">{setFilter.error}</p> : null}
          {syntaxFilter.error ? <p className="hub-warn">{syntaxFilter.error}</p> : null}
          {setFilter.loading || syntaxFilter.loading ? (
            <p className="hub-muted">Updating filters…</p>
          ) : null}
          {isUnifiedListView ? (
            <UnifiedListBrowse
              deck={browseDeck}
              onSelectInstance={onSelectUnifiedInstance}
              deckMeta={deckMeta}
              deckMetaWarn={sizeWarn || targetsVsCubeWarn}
              syncStatus={syncStatus}
            />
          ) : isColourIdentityView ? (
            <ColourIdentityBrowse
              deck={browseDeck}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              layout={layout}
              cardSort={cardSort}
              separateLands={view === 'colour_identity_spells'}
              onDropCard={readOnly ? () => {} : onDropCard}
              onCardContextMenu={readOnly ? () => {} : onCardContextMenu}
              onPickSlot={
                readOnly
                  ? undefined
                  : (category) => {
                      setPickSlotCategory(category);
                      setAddOpen(true);
                    }
              }
              onVisibleOrderChange={onMainVisibleOrderChange}
              onSetOwnership={readOnly ? undefined : onSetOwnership}
              onSetVisibility={readOnly ? undefined : onSetVisibility}
              onRename={readOnly ? undefined : (name) => commitPatch({ name })}
              onSetDescription={
                readOnly ? undefined : (description) => commitPatch({ description })
              }
              deckMeta={deckMeta}
              deckMetaWarn={sizeWarn || targetsVsCubeWarn}
              syncStatus={syncStatus}
            />
          ) : (
            <CategoryBrowse
              deck={browseDeck}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              layout={layout}
              cardSort={cardSort}
              onDropCard={readOnly ? () => {} : onDropCard}
              onCardContextMenu={readOnly ? () => {} : onCardContextMenu}
              onPickSlot={
                readOnly
                  ? undefined
                  : (category) => {
                      setPickSlotCategory(category);
                      setAddOpen(true);
                    }
              }
              onVisibleOrderChange={onMainVisibleOrderChange}
              onSetOwnership={readOnly ? undefined : onSetOwnership}
              onSetVisibility={readOnly ? undefined : onSetVisibility}
              onRename={readOnly ? undefined : (name) => commitPatch({ name })}
              onSetDescription={
                readOnly ? undefined : (description) => commitPatch({ description })
              }
              deckMeta={deckMeta}
              deckMetaWarn={sizeWarn || targetsVsCubeWarn}
              syncStatus={syncStatus}
              browseView={isCategoryBrowseView(view) ? view : 'category'}
              onEditCategory={readOnly ? undefined : (cat) => setEditingCategory(cat)}
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
              deck={liveDeck}
              setMembership={setFilter.active ? setFilter.membership : null}
              readOnly={queuesReadOnly}
              onChange={(next) => {
                commit(next);
              }}
              draft={draft}
              onStartEdit={(entry) => {
                swapDraftHistoryRecorded.current = false;
                consumedPairRef.current = entry.id;
                setDraft(draftFromFormalEntry(entry));
                writeBuilderPairHash(entry.id);
              }}
              onDraftChange={patchSwapDraft}
              onConfirmIn={onConfirmSwapIn}
              onCancelEdit={() => {
                flushSwapAutosave();
                clearSwapEdit();
              }}
              onRemoveEdit={removeSwapEdit}
              onFinalizeEdit={finalizeSwapEdit}
              onViewInSwapQueue={
                queuesReadOnly || !draft
                  ? undefined
                  : () => {
                      navigateHub(
                        swapQueuePairHash(hubUserSlug(), liveDeck.deckId, draft.entryId),
                      );
                    }
              }
            />
            <CategoryBrowse
              deck={browseDeck}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              layout="stacked"
              cardSort={cardSort}
              onDropCard={view === 'category_multi' ? undefined : onDropCard}
              onCardContextMenu={onCardContextMenu}
              onEditCategory={(cat) => setEditingCategory(cat)}
              onMarkMainDeckSeeking={onMarkMainDeckSeeking}
              seekingCountPulse={seekingCountPulse}
              onVisibleOrderChange={onAsideVisibleOrderChange}
              queuesReadOnly={queuesReadOnly}
              mode="aside"
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
            {asideTab === 'profile' ? <DeckProfilePanel deck={liveDeck} /> : null}
          </div>
        </aside>
        </CardFlagCharmProvider>
      </div>

      {moveOpen && selectionCount ? (
        <MoveSheet
          deck={liveDeck}
          cards={selectedCards}
          initialCreatingNew={moveCreatingNew}
          onClose={() => {
            setMoveOpen(false);
            setMoveCreatingNew(false);
          }}
          onApply={(next) => {
            commit(next);
            setMoveOpen(false);
            setMoveCreatingNew(false);
          }}
        />
      ) : null}

      {addOpen ? (
        <ScryfallSearchModal
          deck={liveDeck}
          onClose={() => {
            setAddOpen(false);
            setPickSlotCategory(null);
          }}
          onAdd={onAddCard}
          title={pickSlotCategory ? `Choose ${pickSlotCategory}` : undefined}
          defaultCategory={pickSlotCategory || undefined}
          categoryOptions={pickSlotCategory ? [pickSlotCategory] : undefined}
          extraQuery={
            liveDeck.format === 'pendragon' && pickSlotCategory
              ? formatScryfallClause('pendragon', pendragonRoleForCategory(pickSlotCategory))
              : undefined
          }
          allowQuickAdd={!pickSlotCategory}
          onRemoveInDeckCard={pickSlotCategory ? undefined : onRemoveInDeckCardFromPicker}
          onInDeckContextMenu={pickSlotCategory ? undefined : onInDeckContextMenuFromPicker}
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
          deck={liveDeck}
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

      {basicsOpen ? (
        <BasicLandsPanel
          deck={liveDeck}
          onChange={(next) => commit(next)}
          onClose={() => setBasicsOpen(false)}
        />
      ) : null}

      {editingCategory ? (
        <CategoryEditDialog
          deck={liveDeck}
          categoryName={editingCategory}
          onChange={(next) => {
            commitPatch({
              categories: next.categories,
              // Only apply cards when rename rewrote memberships (same ref = no rename).
              ...(next.cards !== liveDeck.cards ? { cards: next.cards } : {}),
            });
          }}
          onClose={() => setEditingCategory(null)}
          onOpenReorder={() => setCategoriesOpen(true)}
        />
      ) : null}

      {contextMenu && contextCard && !readOnly ? (
        <CardContextMenu
          state={contextMenu}
          selectionCount={selectionCount}
          isCover={liveDeck.coverInstanceId === contextCard.instanceId}
          coverActionLabel={
            isCommanderCategory(contextCard.primaryCategory) ? 'primary' : 'cover'
          }
          foil={Boolean(contextCard.foil)}
          foilEnabled={
            multi
              ? selectedCards.some((c) => cardSupportsFoilToggle(liveDeck, c))
              : cardSupportsFoilToggle(liveDeck, contextCard)
          }
          proxy={Boolean(contextCard.proxy)}
          seeking={cardIsSeekingMarked(contextCard)}
          secondaryCategories={secondaryCategoriesOf(contextCard)}
          categoryOptions={deckCategoryOptions(liveDeck).filter(
            (c) =>
              c !== contextCard.primaryCategory &&
              !(contextCard.categories || []).includes(c),
          )}
          format={liveDeck.format}
          categoryOrder={(liveDeck.categories || []).map((c) => c.name)}
          onClose={() => setContextMenu(null)}
          onToggleFoil={onToggleFoil}
          onToggleProxy={onToggleProxy}
          onSetCover={() => {
            commitPatch({ coverInstanceId: contextCard.instanceId });
          }}
          onClearCover={onClearCover}
          onMove={() => setMoveOpen(true)}
          onMoveToDefault={onMoveToDefault}
          onAddToSwapQueue={queuesReadOnly ? undefined : onAddToSwapQueue}
          onToggleSeeking={queuesReadOnly ? undefined : onToggleSeeking}
          onChangePrinting={() => setPrintingOpen(true)}
          onCopyImage={() => {
            void copyCardImageToClipboard(contextCard);
          }}
          copyImageEnabled={Boolean(cardImageCopyUrl(contextCard))}
          onRemove={onRemoveSelected}
          onRemoveSecondary={(category) => {
            const current = deckRef.current;
            const cards = removeSecondaryCategory(
              current.cards,
              contextCard.instanceId,
              category,
            );
            const patched = { ...current, cards };
            if (isSeekingCategory(category)) {
              commit(reconcileLookingForFromCards(patched));
            } else {
              commitPatch({ cards });
            }
          }}
          onAddSecondary={(category) => {
            const current = deckRef.current;
            const cards = addSecondaryCategory(current.cards, contextCard.instanceId, category);
            const categories = ensureCategoryDef(current.categories || [], category);
            if (isSeekingCategory(category)) {
              commit(
                reconcileLookingForFromCards({
                  ...current,
                  cards,
                  categories,
                }),
              );
            } else {
              commitPatch({ cards, categories });
            }
          }}
        />
      ) : null}

      {readOnly ? null : (
        <AddCardFab
          onAddClick={() => {
            setPickSlotCategory(null);
            setAddOpen(true);
          }}
          onDropDefault={(ids) => {
            commit(moveCardsToDefaultCategories(deckRef.current, ids));
          }}
          onDropMaybeboard={(ids) => {
            commit(moveCardsCategory(deckRef.current, ids, MAYBEBOARD));
          }}
          onDropNewCategory={(ids) => {
            setSelectedIds(new Set(ids));
            setSelectionAnchorId(ids[0] ?? null);
            setMoveCreatingNew(true);
            setMoveOpen(true);
          }}
        />
      )}
    </div>
  );
}
