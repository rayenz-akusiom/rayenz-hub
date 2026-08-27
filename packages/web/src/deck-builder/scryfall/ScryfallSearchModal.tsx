import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  cardHasBackFace,
  commanderIdentityScryfallQuery,
  defaultAddCategory,
  defaultCategoryForCard,
  deckCategoryOptions,
  fetchPrintingsPage,
  formatScryfallClause,
  isBasicLand,
  isCommandZoneFormat,
  mapScryfallCardToPrinting,
  MAYBEBOARD,
  pendragonRoleForCategory,
  scryfallCardImageUrl,
  scryfallImageFromId,
  searchCards,
  searchCardsNextPage,
  type DeckDocument,
  type PrintingFields,
  type ScryfallCard,
  type ScryfallSearchPage,
} from '@rayenz-hub/shared';
import { PrintingPickerModal } from './PrintingPickerModal';
import { CardFace } from '../browse/CardFace';
import { CardSizePicker } from '../CardSizePicker';
import { DbMenu, DbMenuItem } from '../ui/DbMenu';
import { loadRecentScryfallSearches, rememberScryfallSearch } from './recent-searches';
import {
  loadScryfallSearchExpanded,
  saveScryfallSearchExpanded,
} from './search-expanded';
import {
  loadScryfallQuickAddPref,
  saveScryfallQuickAddPref,
  scryfallQuickAddMenuValue,
  type ScryfallQuickAddPref,
} from './quick-add-pref';
import { useInfiniteScrollSentinel } from './useInfiniteScrollSentinel';
import { useDialogA11y } from '../../ui/useDialogA11y';
import { useLongPress } from '../useLongPress';

export type ScryfallAddMeta = { proxy: boolean; keepOpen?: boolean };

export type PickerMenuPosition = { x: number; y: number };

function inDeckCountForCard(
  inDeckByName: Map<string, number>,
  cardResult: ScryfallCard,
): number {
  return inDeckByName.get(String(cardResult.name || '').trim().toLowerCase()) || 0;
}

/** Non-basics already in the deck cannot be added again from the picker. */
export function isPickerAddBlocked(
  cardResult: Pick<ScryfallCard, 'name' | 'type_line'>,
  inDeckCount: number,
): boolean {
  if (inDeckCount <= 0) return false;
  return !isBasicLand({ name: cardResult.name, typeLine: cardResult.type_line || null });
}

/** Case-insensitive name → quantity already in the deck. */
export function deckCardNameCounts(deck: Pick<DeckDocument, 'cards'>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of deck.cards || []) {
    const key = String(card.name || '')
      .trim()
      .toLowerCase();
    if (!key) continue;
    const qty = typeof card.quantity === 'number' && card.quantity > 0 ? card.quantity : 1;
    counts.set(key, (counts.get(key) || 0) + qty);
  }
  return counts;
}

/** Freeform query plus optional Include clauses (kept out of the input). */
export function composeScryfallQuery(
  freeform: string,
  opts: {
    includeIdentity?: boolean;
    includeFormatCommander?: boolean;
    extraQuery?: string | null;
  },
  deck: Pick<DeckDocument, 'format' | 'cards' | 'oracle'>,
): string {
  const parts = [freeform.trim()];
  if (opts.extraQuery) parts.push(opts.extraQuery.trim());
  if (opts.includeFormatCommander && !opts.extraQuery) {
    const clause = formatScryfallClause(deck.format);
    if (clause) parts.push(clause);
  }
  if (opts.includeIdentity) {
    const clause = commanderIdentityScryfallQuery(deck);
    if (clause) parts.push(clause);
  }
  return parts.filter(Boolean).join(' ');
}

function includeMenuValue(includeIdentity: boolean, includeFormatCommander: boolean): string {
  const labels: string[] = [];
  if (includeIdentity) labels.push('Identity');
  if (includeFormatCommander) labels.push('Format');
  return labels.length ? labels.join(', ') : 'None';
}

/** True when page 1 is the complete set of printings and there is exactly one. */
export function isSolePrintingPage(page: Pick<ScryfallSearchPage, 'data' | 'has_more'>): boolean {
  return page.data.length === 1 && !page.has_more;
}

export function ScryfallSearchModal({
  deck,
  onClose,
  onAdd,
  title = 'Add card from Scryfall',
  confirmLabel = 'Add to deck',
  printingTitle,
  defaultCategory,
  categoryOptions,
  extraQuery,
  embedded = false,
  allowQuickAdd = false,
  onRemoveInDeckCard,
  onInDeckContextMenu,
}: {
  deck: DeckDocument;
  onClose: () => void;
  onAdd: (printing: PrintingFields, category: string, meta?: ScryfallAddMeta) => void;
  title?: string;
  confirmLabel?: string;
  /** Title for the nested printing step; defaults to `Add — {name}` / confirm-based. */
  printingTitle?: (cardName: string) => string;
  defaultCategory?: string;
  /** When set, limits the printing-picker category list (e.g. swap Place In). */
  categoryOptions?: string[];
  /** Always appended (slot role query). Replaces Include Format when set. */
  extraQuery?: string;
  /** Skip outer `.db-modal` backdrop (host provides the shell). */
  embedded?: boolean;
  /** Show Quick add destination menu (deck FAB add flow). */
  allowQuickAdd?: boolean;
  /** Right-click on an in-deck result removes one copy (deck FAB add flow). */
  onRemoveInDeckCard?: (card: ScryfallCard) => void;
  /** Long-press on an in-deck result opens the builder card context menu. */
  onInDeckContextMenu?: (card: ScryfallCard, pos: PickerMenuPosition) => void;
}) {
  const isCommandZone = isCommandZoneFormat(deck.format);
  const overlayRef = useRef<HTMLDivElement>(null);
  useDialogA11y(!embedded, onClose, overlayRef);
  const [query, setQuery] = useState('');
  const [includeCommanderIdentity, setIncludeCommanderIdentity] = useState(isCommandZone);
  const [includeFormatCommander, setIncludeFormatCommander] = useState(isCommandZone);
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [totalCards, setTotalCards] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ScryfallCard | null>(null);
  const [recent, setRecent] = useState(() => loadRecentScryfallSearches());
  const [quickAddPref, setQuickAddPref] = useState<ScryfallQuickAddPref>(() =>
    loadScryfallQuickAddPref(),
  );
  const quickAdd = quickAddPref.kind !== 'off';
  const [showBackToSearch, setShowBackToSearch] = useState(false);
  const [resolvingPrinting, setResolvingPrinting] = useState(false);
  const [expanded, setExpanded] = useState(() =>
    embedded ? false : loadScryfallSearchExpanded(),
  );
  const longPress = useLongPress();
  const lastComposedQueryRef = useRef('');
  const nextPageRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const resolvePrintingReqRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  nextPageRef.current = nextPage;

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const formEl = formRef.current;
    if (!scrollEl || !formEl || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowBackToSearch(!entry.isIntersecting);
      },
      { root: scrollEl, threshold: 0 },
    );
    observer.observe(formEl);
    return () => observer.disconnect();
  }, []);

  const categories = categoryOptions ?? deckCategoryOptions(deck);
  const quickAddCategoryChoices = categories.filter((name) => name !== MAYBEBOARD);
  const inDeckByName = deckCardNameCounts(deck);
  const printingHint = pending
    ? {
        name: pending.name,
        colourIdentity: (pending.color_identity || []) as ('W' | 'U' | 'B' | 'R' | 'G')[],
        typeLine: pending.type_line || null,
      }
    : null;

  function typeDefaultCategory(
    printing: Pick<PrintingFields, 'name' | 'colourIdentity' | 'typeLine'> &
      Partial<Pick<PrintingFields, 'scryfallId' | 'setCode' | 'collectorNumber'>>,
  ): string {
    return defaultCategoryForCard(deck, {
      name: printing.name,
      scryfallId: printing.scryfallId,
      setCode: printing.setCode,
      collectorNumber: printing.collectorNumber,
      colourIdentity: printing.colourIdentity,
      typeLine: printing.typeLine,
    });
  }

  function resolvePreferredCategory(
    printing?: Pick<PrintingFields, 'name' | 'colourIdentity' | 'typeLine'> &
      Partial<Pick<PrintingFields, 'scryfallId' | 'setCode' | 'collectorNumber'>> | null,
  ): string {
    if (defaultCategory) return defaultCategory;
    if (quickAddPref.kind === 'maybeboard') return MAYBEBOARD;
    if (quickAddPref.kind === 'category') return quickAddPref.name;
    if (quickAddPref.kind === 'default' && printing) return typeDefaultCategory(printing);
    if (quickAddPref.kind === 'default' && printingHint) {
      return typeDefaultCategory(printingHint);
    }
    return defaultAddCategory(deck, printing ?? printingHint);
  }

  const defaultCat = resolvePreferredCategory(printingHint);

  function selectQuickAddPref(next: ScryfallQuickAddPref) {
    setQuickAddPref(next);
    saveScryfallQuickAddPref(next);
  }

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      saveScryfallSearchExpanded(next);
      return next;
    });
  }

  function openPrintingPicker(cardResult: ScryfallCard) {
    longPress.clear();
    setPending(cardResult);
  }

  const deckEditPicker = Boolean(onRemoveInDeckCard || onInDeckContextMenu);

  function categoryForPrinting(printing: PrintingFields): string {
    if (defaultCategory) return defaultCategory;
    if (quickAddPref.kind === 'maybeboard') return MAYBEBOARD;
    if (quickAddPref.kind === 'category') return quickAddPref.name;
    return typeDefaultCategory(printing);
  }

  function stampCommonPrinting(printing: PrintingFields, category: string): PrintingFields {
    if (deck.format !== 'pendragon') return printing;
    if (pendragonRoleForCategory(category) === 'excalibur') return printing;
    if (!includeFormatCommander && !extraQuery) return printing;
    return { ...printing, hasCommonPrinting: true };
  }

  function emitAdd(
    printing: PrintingFields,
    category: string,
    meta?: ScryfallAddMeta,
  ) {
    onAdd(stampCommonPrinting(printing, category), category, meta);
  }

  function quickAddCard(cardResult: ScryfallCard) {
    if (
      deckEditPicker &&
      isPickerAddBlocked(cardResult, inDeckCountForCard(inDeckByName, cardResult))
    ) {
      return;
    }
    const printing = mapScryfallCardToPrinting(cardResult);
    emitAdd(printing, categoryForPrinting(printing), { proxy: false, keepOpen: true });
  }

  /** Prefetch printings; add immediately when there is only one, else open the picker. */
  async function tryAddOrOpenPicker(cardResult: ScryfallCard) {
    const reqId = ++resolvePrintingReqRef.current;
    setResolvingPrinting(true);
    setError(null);
    try {
      const page = await fetchPrintingsPage(cardResult.name, 1, {
        defaultScryfallId: cardResult.id,
      });
      if (reqId !== resolvePrintingReqRef.current) return;
      if (isSolePrintingPage(page)) {
        const printing = mapScryfallCardToPrinting(page.data[0]!);
        emitAdd(printing, categoryForPrinting(printing), { proxy: false });
        return;
      }
      openPrintingPicker(cardResult);
    } catch {
      if (reqId !== resolvePrintingReqRef.current) return;
      openPrintingPicker(cardResult);
    } finally {
      if (reqId === resolvePrintingReqRef.current) {
        setResolvingPrinting(false);
      }
    }
  }

  function onResultPointerDown(e: ReactPointerEvent, cardResult: ScryfallCard) {
    const inDeckCount = inDeckCountForCard(inDeckByName, cardResult);
    const canOpenInDeckMenu = Boolean(onInDeckContextMenu) && inDeckCount > 0;
    const canOpenPrintingLongPress = Boolean(allowQuickAdd && quickAdd);
    if (!canOpenInDeckMenu && !canOpenPrintingLongPress) return;

    longPress.start(e, (pos) => {
      if (canOpenInDeckMenu && onInDeckContextMenu) {
        onInDeckContextMenu(cardResult, pos);
        return;
      }
      openPrintingPicker(cardResult);
    });
  }

  function onResultClick(cardResult: ScryfallCard) {
    if (longPress.consumeClick()) return;
    if (
      deckEditPicker &&
      isPickerAddBlocked(cardResult, inDeckCountForCard(inDeckByName, cardResult))
    ) {
      return;
    }
    if (allowQuickAdd && quickAdd) {
      quickAddCard(cardResult);
      return;
    }
    void tryAddOrOpenPicker(cardResult);
  }

  function onResultContextMenu(e: ReactMouseEvent, cardResult: ScryfallCard) {
    const inDeckCount = inDeckCountForCard(inDeckByName, cardResult);
    if (onRemoveInDeckCard && inDeckCount > 0) {
      e.preventDefault();
      onRemoveInDeckCard(cardResult);
      return;
    }
    if (allowQuickAdd && quickAdd) e.preventDefault();
  }

  async function runSearch(e?: FormEvent, overrideQuery?: string) {
    e?.preventDefault();
    const freeform = (overrideQuery ?? query).trim();
    if (overrideQuery != null) setQuery(freeform);
    const composed = composeScryfallQuery(
      freeform,
      {
        includeIdentity: includeCommanderIdentity,
        includeFormatCommander,
        extraQuery,
      },
      deck,
    );
    if (!composed) {
      setError('Enter a Scryfall search query.');
      return;
    }
    lastComposedQueryRef.current = composed;
    setLoading(true);
    setLoadingMore(false);
    loadingMoreRef.current = false;
    setError(null);
    setPending(null);
    try {
      const page1 = await searchCards(composed, 1);
      setResults(page1.data);
      setTotalCards(typeof page1.total_cards === 'number' ? page1.total_cards : null);
      setHasMore(page1.has_more);
      setNextPage(page1.next_page);
      setPage(1);
      setRecent(freeform ? rememberScryfallSearch(freeform) : loadRecentScryfallSearches());
      if (!page1.data.length) {
        setError('No cards matched that search.');
      }
    } catch (err: unknown) {
      setResults([]);
      setTotalCards(null);
      setHasMore(false);
      setNextPage(null);
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  }

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const next = nextPageRef.current
        ? await searchCardsNextPage(nextPageRef.current)
        : await searchCards(
            lastComposedQueryRef.current ||
              composeScryfallQuery(
                query,
                {
                  includeIdentity: includeCommanderIdentity,
                  includeFormatCommander,
                  extraQuery,
                },
                deck,
              ),
            page + 1,
          );
      setResults((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const appended = next.data.filter((c) => !seen.has(c.id));
        return [...prev, ...appended];
      });
      setHasMore(next.has_more);
      setNextPage(next.next_page);
      setPage((p) => p + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load more.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, page, query, includeCommanderIdentity, includeFormatCommander, extraQuery, deck]);

  const sentinelRef = useInfiniteScrollSentinel({
    rootRef: scrollRef,
    enabled: hasMore && !loading && !pending && results.length > 0,
    loading: loadingMore,
    onLoadMore: () => {
      void loadMore();
    },
  });

  const expandButton = embedded ? null : (
    <button
      type="button"
      className={`db-btn${expanded ? ' is-active' : ''}`}
      aria-pressed={expanded}
      title={
        expanded ? 'Collapse to compact picker' : 'Expand to fill deck builder'
      }
      onClick={toggleExpanded}
    >
      {expanded ? 'Collapse' : 'Expand'}
    </button>
  );

  function wrapOverlay(inner: ReactNode) {
    if (embedded) return inner;
    return (
      <div
        ref={overlayRef}
        className={`db-modal${expanded ? ' is-expanded' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {inner}
      </div>
    );
  }

  if (pending) {
    return wrapOverlay(
      <PrintingPickerModal
        embedded
        expanded={expanded}
        onToggleExpand={embedded ? undefined : toggleExpanded}
        cardName={pending.name}
        defaultScryfallId={pending.id}
        selectedScryfallId={pending.id}
        categoryOptions={categories}
        format={deck.format}
        categoryOrder={(deck.categories || []).map((c) => c.name)}
        defaultCategory={defaultCat}
        confirmLabel={confirmLabel}
        title={printingTitle ? printingTitle(pending.name) : `Add — ${pending.name}`}
        onBack={() => setPending(null)}
        onClose={onClose}
        onConfirm={(printing, category, meta) => {
          emitAdd(printing, category || defaultCat, meta);
        }}
      />,
    );
  }

  const showRecent = !query.trim() && !results.length && recent.length > 0;
  const foundCount = results.length
    ? totalCards != null
      ? totalCards
      : results.length
    : null;
  const foundLabel =
    foundCount == null
      ? null
      : foundCount === 1
        ? '1 card found'
        : `${foundCount} cards found`;

  const card = (
    <div className={`db-modal-card db-modal-picker${expanded ? ' is-expanded' : ''}`}>
      <div className="db-picker-header">
        <h3>{title}</h3>
        <div className="db-picker-header-controls">
          {allowQuickAdd ? (
            <DbMenu
              label="Quick add"
              value={scryfallQuickAddMenuValue(quickAddPref)}
              ariaLabel="Quick add"
              align="end"
              triggerClassName={`db-btn${quickAdd ? ' is-active' : ''}`}
            >
              <DbMenuItem
                active={quickAddPref.kind === 'off'}
                onSelect={() => selectQuickAddPref({ kind: 'off' })}
              >
                Off
              </DbMenuItem>
              <DbMenuItem
                active={quickAddPref.kind === 'default'}
                onSelect={() => selectQuickAddPref({ kind: 'default' })}
              >
                Default
              </DbMenuItem>
              <DbMenuItem
                active={quickAddPref.kind === 'maybeboard'}
                onSelect={() => selectQuickAddPref({ kind: 'maybeboard' })}
              >
                Maybeboard
              </DbMenuItem>
              {quickAddCategoryChoices.map((name) => (
                <DbMenuItem
                  key={name}
                  active={quickAddPref.kind === 'category' && quickAddPref.name === name}
                  onSelect={() => selectQuickAddPref({ kind: 'category', name })}
                >
                  {name}
                </DbMenuItem>
              ))}
            </DbMenu>
          ) : null}
          <CardSizePicker />
          {expandButton}
          <button type="button" className="db-btn" onClick={onClose}>
            {embedded ? 'Back' : 'Close'}
          </button>
        </div>
      </div>

      <div className="db-picker-scroll" ref={scrollRef}>
        <form className="db-search-form" ref={formRef} onSubmit={(e) => void runSearch(e)}>
          <label className="db-search-label">
            Scryfall query
            <input
              ref={inputRef}
              className="db-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='e.g. t:creature o:"draw a card"'
              autoFocus
              spellCheck={false}
            />
          </label>
          {isCommandZone ? (
            <div className="db-search-include">
              <DbMenu
                label="Include"
                value={includeMenuValue(includeCommanderIdentity, includeFormatCommander)}
                ariaLabel="Include in Scryfall search"
              >
                <div
                  className="db-search-include-panel"
                  role="none"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <label className="db-check">
                    <input
                      type="checkbox"
                      checked={includeCommanderIdentity}
                      onChange={(e) => setIncludeCommanderIdentity(e.target.checked)}
                    />
                    Commander identity
                  </label>
                  {extraQuery ? null : (
                  <label className="db-check">
                    <input
                      type="checkbox"
                      checked={includeFormatCommander}
                      onChange={(e) => setIncludeFormatCommander(e.target.checked)}
                    />
                    {deck.format === 'pendragon' ? 'Pendragon format' : 'Commander format'}
                  </label>
                  )}
                </div>
              </DbMenu>
            </div>
          ) : null}
          <button type="submit" className="db-btn is-active" disabled={loading}>
            Search
          </button>
        </form>

        <p className="db-muted db-search-hint">
          {allowQuickAdd && quickAdd
            ? onRemoveInDeckCard
              ? 'Tap to add (once); right-click removes; long-press for menu or printing.'
              : 'Tap a card to add it; long-press to choose printing / category.'
            : onRemoveInDeckCard
              ? 'Pick a card to add (once). Right-click removes; long-press opens the card menu.'
              : 'Uses Scryfall search syntax. Pick a card, then choose a printing.'}
        </p>

        {showRecent ? (
          <div className="db-search-recent" aria-label="Recent searches">
            <p className="db-muted db-search-recent-label">Recent</p>
            <ul className="db-search-recent-list">
              {recent.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    className="db-btn db-search-recent-chip"
                    onClick={() => void runSearch(undefined, q)}
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <p className="db-error">{error}</p> : null}
        {loading && !results.length ? <p className="db-muted">Searching…</p> : null}
        {resolvingPrinting ? <p className="db-muted">Loading printings…</p> : null}
        {foundLabel ? (
          <p className="db-muted" aria-live="polite">
            {foundLabel}
          </p>
        ) : null}

        {results.length ? (
          <div className="db-picker-grid" role="listbox" aria-label="Search results">
            {results.map((cardResult) => {
              const src = scryfallCardImageUrl(cardResult);
              const doubleFaced = cardHasBackFace(cardResult.layout);
              const backSrc = doubleFaced ? scryfallImageFromId(cardResult.id, 'back') : null;
              const inDeckCount =
                inDeckByName.get(String(cardResult.name || '').trim().toLowerCase()) || 0;
              return (
                <button
                  key={cardResult.id}
                  type="button"
                  role="option"
                  className={`db-picker-option${inDeckCount ? ' is-in-deck' : ''}`}
                  title={
                    inDeckCount
                      ? `${cardResult.name} (in deck ×${inDeckCount})`
                      : cardResult.name
                  }
                  onClick={() => {
                    if (resolvingPrinting) return;
                    onResultClick(cardResult);
                  }}
                  onPointerDown={(e) => onResultPointerDown(e, cardResult)}
                  onPointerUp={longPress.end}
                  onPointerLeave={longPress.end}
                  onPointerCancel={longPress.end}
                  onContextMenu={(e) => onResultContextMenu(e, cardResult)}
                >
                  <span className="db-picker-option-face">
                    <CardFace
                      src={src}
                      backSrc={backSrc}
                      name={cardResult.name}
                      faceKey={cardResult.id}
                      doubleFaced={doubleFaced}
                    />
                    {inDeckCount ? (
                      <span className="db-picker-in-deck" aria-label={`In deck ×${inDeckCount}`}>
                        {inDeckCount > 1 ? `In deck ×${inDeckCount}` : 'In deck'}
                      </span>
                    ) : null}
                  </span>
                  <span className="db-picker-option-meta">{cardResult.name}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {hasMore && results.length ? (
          <div
            ref={sentinelRef}
            className="db-picker-scroll-sentinel"
            aria-hidden="true"
          />
        ) : null}
        {loadingMore ? <p className="db-muted db-picker-loading-more">Loading more…</p> : null}
      </div>

      {showBackToSearch ? (
        <button
          type="button"
          className="db-btn db-picker-back-to-search"
          onClick={() => {
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            inputRef.current?.focus();
          }}
        >
          Back to search
        </button>
      ) : null}
    </div>
  );

  return wrapOverlay(card);
}
