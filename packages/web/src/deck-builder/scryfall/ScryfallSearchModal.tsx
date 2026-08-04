import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  cardHasBackFace,
  commanderIdentityScryfallQuery,
  defaultAddCategory,
  defaultCategoryForCard,
  deckCategoryOptions,
  mapScryfallCardToPrinting,
  scryfallCardImageUrl,
  scryfallImageFromId,
  searchCards,
  searchCardsNextPage,
  type DeckDocument,
  type PrintingFields,
  type ScryfallCard,
} from '@rayenz-hub/shared';
import { PrintingPickerModal } from './PrintingPickerModal';
import { CardFace } from '../browse/CardFace';
import { CardSizePicker } from '../CardSizePicker';
import { DbMenu } from '../ui/DbMenu';
import { loadRecentScryfallSearches, rememberScryfallSearch } from './recent-searches';
import { useInfiniteScrollSentinel } from './useInfiniteScrollSentinel';

const LONG_PRESS_MS = 450;

export type ScryfallAddMeta = { proxy: boolean; keepOpen?: boolean };

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

/** Freeform query plus optional Include clauses (identity stays out of the input). */
export function composeScryfallQuery(
  freeform: string,
  includeIdentity: boolean,
  deck: Pick<DeckDocument, 'format' | 'cards' | 'oracle'>,
): string {
  const parts = [freeform.trim()];
  if (includeIdentity) {
    const clause = commanderIdentityScryfallQuery(deck);
    if (clause) parts.push(clause);
  }
  return parts.filter(Boolean).join(' ');
}

export function ScryfallSearchModal({
  deck,
  onClose,
  onAdd,
  title = 'Add card from Scryfall',
  confirmLabel = 'Add to deck',
  printingTitle,
  defaultCategory,
  embedded = false,
  allowQuickAdd = false,
}: {
  deck: DeckDocument;
  onClose: () => void;
  onAdd: (printing: PrintingFields, category: string, meta?: ScryfallAddMeta) => void;
  title?: string;
  confirmLabel?: string;
  /** Title for the nested printing step; defaults to `Add — {name}` / confirm-based. */
  printingTitle?: (cardName: string) => string;
  defaultCategory?: string;
  /** Skip outer `.db-modal` backdrop (host provides the shell). */
  embedded?: boolean;
  /** Show session Quick add toggle (deck FAB add flow). */
  allowQuickAdd?: boolean;
}) {
  const isCommander = deck.format === 'commander';
  const [query, setQuery] = useState('');
  const [includeCommanderIdentity, setIncludeCommanderIdentity] = useState(isCommander);
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ScryfallCard | null>(null);
  const [recent, setRecent] = useState(() => loadRecentScryfallSearches());
  const [quickAdd, setQuickAdd] = useState(false);
  const [showBackToSearch, setShowBackToSearch] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const lastComposedQueryRef = useRef('');
  const nextPageRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
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

  const categories = deckCategoryOptions(deck);
  const inDeckByName = deckCardNameCounts(deck);
  const printingHint = pending
    ? {
        name: pending.name,
        colourIdentity: (pending.color_identity || []) as ('W' | 'U' | 'B' | 'R' | 'G')[],
        typeLine: pending.type_line || null,
      }
    : null;
  const defaultCat = defaultCategory || defaultAddCategory(deck, printingHint);

  function clearLongPressTimer() {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function openPrintingPicker(cardResult: ScryfallCard) {
    clearLongPressTimer();
    setPending(cardResult);
  }

  function quickAddCard(cardResult: ScryfallCard) {
    const printing = mapScryfallCardToPrinting(cardResult);
    const category = defaultCategoryForCard(deck, {
      name: printing.name,
      scryfallId: printing.scryfallId,
      setCode: printing.setCode,
      collectorNumber: printing.collectorNumber,
      colourIdentity: printing.colourIdentity,
      typeLine: printing.typeLine,
    });
    onAdd(printing, category, { proxy: false, keepOpen: true });
  }

  function onResultPointerDown(e: ReactPointerEvent, cardResult: ScryfallCard) {
    if (!allowQuickAdd || !quickAdd) return;
    // Ignore non-primary mouse buttons; touch/pen often omit `button`.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    longPressFiredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      longPressTimerRef.current = null;
      openPrintingPicker(cardResult);
    }, LONG_PRESS_MS);
  }

  function onResultPointerEnd() {
    clearLongPressTimer();
  }

  function onResultClick(cardResult: ScryfallCard) {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (allowQuickAdd && quickAdd) {
      quickAddCard(cardResult);
      return;
    }
    openPrintingPicker(cardResult);
  }

  async function runSearch(e?: FormEvent, overrideQuery?: string) {
    e?.preventDefault();
    const freeform = (overrideQuery ?? query).trim();
    if (!freeform) {
      setError('Enter a Scryfall search query.');
      return;
    }
    if (overrideQuery != null) setQuery(freeform);
    const composed = composeScryfallQuery(freeform, includeCommanderIdentity, deck);
    lastComposedQueryRef.current = composed;
    setLoading(true);
    setLoadingMore(false);
    loadingMoreRef.current = false;
    setError(null);
    setPending(null);
    try {
      const page1 = await searchCards(composed, 1);
      setResults(page1.data);
      setHasMore(page1.has_more);
      setNextPage(page1.next_page);
      setPage(1);
      setRecent(rememberScryfallSearch(freeform));
      if (!page1.data.length) {
        setError('No cards matched that search.');
      }
    } catch (err: unknown) {
      setResults([]);
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
              composeScryfallQuery(query, includeCommanderIdentity, deck),
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
  }, [hasMore, page, query, includeCommanderIdentity, deck]);

  const sentinelRef = useInfiniteScrollSentinel({
    rootRef: scrollRef,
    enabled: hasMore && !loading && !pending && results.length > 0,
    loading: loadingMore,
    onLoadMore: () => {
      void loadMore();
    },
  });

  if (pending) {
    return (
      <PrintingPickerModal
        embedded={embedded}
        cardName={pending.name}
        defaultScryfallId={pending.id}
        selectedScryfallId={pending.id}
        categoryOptions={categories}
        defaultCategory={defaultCat}
        confirmLabel={confirmLabel}
        title={printingTitle ? printingTitle(pending.name) : `Add — ${pending.name}`}
        onBack={() => setPending(null)}
        onClose={onClose}
        onConfirm={(printing, category, meta) => {
          onAdd(printing, category || defaultCat, meta);
        }}
      />
    );
  }

  const showRecent = !query.trim() && !results.length && recent.length > 0;

  const card = (
    <div className="db-modal-card db-modal-picker">
      <div className="db-picker-header">
        <h3>{title}</h3>
        <div className="db-picker-header-controls">
          {allowQuickAdd ? (
            <button
              type="button"
              className={`db-btn${quickAdd ? ' is-active' : ''}`}
              aria-pressed={quickAdd}
              title={
                quickAdd
                  ? 'Quick add on — tap to add, long-press for printing'
                  : 'Quick add off — tap opens printing picker'
              }
              onClick={() => setQuickAdd((v) => !v)}
            >
              Quick add
            </button>
          ) : null}
          <CardSizePicker />
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
          {isCommander ? (
            <div className="db-search-include">
              <DbMenu
                label="Include"
                value={includeCommanderIdentity ? 'Identity' : 'None'}
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
            ? 'Tap a card to add it; long-press to choose printing / category.'
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
                  onClick={() => onResultClick(cardResult)}
                  onPointerDown={(e) => onResultPointerDown(e, cardResult)}
                  onPointerUp={onResultPointerEnd}
                  onPointerLeave={onResultPointerEnd}
                  onPointerCancel={onResultPointerEnd}
                  onContextMenu={(e) => {
                    if (allowQuickAdd && quickAdd) e.preventDefault();
                  }}
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

  if (embedded) return card;

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label={title}>
      {card}
    </div>
  );
}
