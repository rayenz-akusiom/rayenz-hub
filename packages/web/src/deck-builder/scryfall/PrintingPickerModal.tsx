import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canonicalizeCategoryName,
  cardHasBackFace,
  fetchCardById,
  fetchPrintingsPage,
  mapScryfallCardToPrinting,
  normalizeSetCodes,
  printingSupportsFoil,
  scryfallCardImageUrl,
  scryfallImageFromId,
  searchCardsNextPage,
  type DeckFormat,
  type PrintingFields,
  type ScryfallCard,
} from '@rayenz-hub/shared';
import { CardFace } from '../browse/CardFace';
import { CardSizePicker } from '../CardSizePicker';
import { CategorySelectOptgroups } from '../edit/CategorySelectOptgroups';
import { useInfiniteScrollSentinel } from './useInfiniteScrollSentinel';

const NEW_CATEGORY_VALUE = '__new__';

function preferPicked(
  list: ScryfallCard[],
  selectedScryfallId: string | null,
  defaultScryfallId: string | null,
): ScryfallCard | null {
  return (
    list.find((p) => p.id === selectedScryfallId) ||
    list.find((p) => p.id === defaultScryfallId) ||
    list[0] ||
    null
  );
}

function prependUnique(pin: ScryfallCard | null, list: ScryfallCard[]): ScryfallCard[] {
  if (!pin) return list;
  if (list.some((p) => p.id === pin.id)) return list;
  return [pin, ...list];
}

export function PrintingPickerModal({
  cardName,
  defaultScryfallId = null,
  foilDefault = false,
  proxyDefault = false,
  selectedScryfallId = null,
  categoryOptions,
  format = 'commander',
  categoryOrder,
  defaultCategory,
  confirmLabel = 'Apply',
  title,
  setCodes: setCodesProp,
  onSetCodesChange,
  onConfirm,
  onClose,
  onBack,
  embedded = false,
  expanded = false,
  onToggleExpand,
}: {
  cardName: string;
  defaultScryfallId?: string | null;
  foilDefault?: boolean;
  proxyDefault?: boolean;
  selectedScryfallId?: string | null;
  /** When set, shows a category select (add flow). */
  categoryOptions?: string[];
  /** Format for Custom / Default optgroups (add flow). */
  format?: DeckFormat;
  /** Categories (Custom) browse order for the Custom optgroup. */
  categoryOrder?: string[];
  defaultCategory?: string;
  confirmLabel?: string;
  title?: string;
  /** Applied set-code filter (Basics panel lifts this across land types). */
  setCodes?: string[];
  onSetCodesChange?: (codes: string[]) => void;
  onConfirm: (
    printing: PrintingFields,
    category?: string,
    meta?: { proxy: boolean },
  ) => void;
  onClose: () => void;
  onBack?: () => void;
  /** Skip outer `.db-modal` backdrop (host provides the shell). */
  embedded?: boolean;
  /** Fill layout when hosted in an expanded Scryfall search overlay. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const initialCodes = normalizeSetCodes(setCodesProp);
  const [codesInput, setCodesInput] = useState(() => initialCodes.join(','));
  const [appliedCodes, setAppliedCodes] = useState<string[]>(() => initialCodes);
  const [prints, setPrints] = useState<ScryfallCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ScryfallCard | null>(null);
  const [foil, setFoil] = useState(foilDefault);
  const [proxy, setProxy] = useState(proxyDefault);
  const [category, setCategory] = useState(
    defaultCategory || categoryOptions?.[0] || 'Maybeboard',
  );
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const nextPageRef = useRef<string | null>(null);
  nextPageRef.current = nextPage;
  const filterActive = appliedCodes.length > 0;

  function commitSetCodes(codes: string[]) {
    const next = normalizeSetCodes(codes);
    setCodesInput(next.join(','));
    setAppliedCodes(next);
    onSetCodesChange?.(next);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadingMore(false);
    loadingMoreRef.current = false;
    setError(null);
    setPrints([]);
    setHasMore(false);
    setNextPage(null);
    setPicked(null);

    const pinId = filterActive ? null : selectedScryfallId || defaultScryfallId || null;

    void (async () => {
      try {
        const page1 = await fetchPrintingsPage(cardName, 1, {
          defaultScryfallId: filterActive ? null : defaultScryfallId,
          setCodes: appliedCodes,
        });
        if (cancelled) return;

        let list = page1.data;
        let pin: ScryfallCard | null = null;
        if (pinId && !list.some((p) => p.id === pinId)) {
          pin = await fetchCardById(pinId);
          if (cancelled) return;
          list = prependUnique(pin, list);
        }

        setPrints(list);
        setHasMore(page1.has_more);
        setNextPage(page1.next_page);
        setPicked(
          filterActive
            ? list[0] || null
            : preferPicked(list, selectedScryfallId, defaultScryfallId),
        );
        if (!list.length) {
          setError(filterActive ? 'No printings in those sets.' : 'No printings found.');
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load printings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cardName, defaultScryfallId, selectedScryfallId, appliedCodes, filterActive]);

  const loadMore = useCallback(async () => {
    const url = nextPageRef.current;
    if (!url || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await searchCardsNextPage(url);
      setPrints((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const appended = next.data.filter((p) => !seen.has(p.id));
        return [...prev, ...appended];
      });
      setHasMore(next.has_more);
      setNextPage(next.next_page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load more printings.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const sentinelRef = useInfiniteScrollSentinel({
    rootRef: scrollRef,
    enabled: hasMore && !loading && !error,
    loading: loadingMore,
    onLoadMore: () => {
      void loadMore();
    },
  });

  const anyFoil = prints.some(printingSupportsFoil);

  function resolvedCategory(): string | undefined {
    if (!categoryOptions) return undefined;
    if (creatingNew) {
      return canonicalizeCategoryName(newCategory.trim()) || undefined;
    }
    return category;
  }

  function confirm() {
    if (!picked) return;
    const cat = resolvedCategory();
    if (categoryOptions && !cat) return;
    const printing = mapScryfallCardToPrinting(picked, {
      foil: foil && printingSupportsFoil(picked),
    });
    onConfirm(printing, cat, { proxy });
  }

  const card = (
    <div className={`db-modal-card db-modal-picker${expanded ? ' is-expanded' : ''}`}>
      <div className="db-picker-header">
        <h3>{title || `Printing — ${cardName}`}</h3>
        <div className="db-picker-header-controls">
          <CardSizePicker />
          {onToggleExpand ? (
            <button
              type="button"
              className={`db-btn${expanded ? ' is-active' : ''}`}
              aria-pressed={expanded}
              title={
                expanded ? 'Collapse to compact picker' : 'Expand to fill deck builder'
              }
              onClick={onToggleExpand}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          ) : null}
          <label className="db-check">
            <input
              type="checkbox"
              checked={proxy}
              onChange={(e) => setProxy(e.target.checked)}
            />
            Proxy
          </label>
          {anyFoil ? (
            <label className="db-check">
              <input
                type="checkbox"
                checked={foil}
                onChange={(e) => setFoil(e.target.checked)}
              />
              Foil
            </label>
          ) : null}
          <button type="button" className="db-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="db-picker-set-filter">
        <label>
          Set codes
          <input
            className="db-input"
            type="text"
            value={codesInput}
            placeholder="unf, sld"
            aria-label="Set codes"
            spellCheck={false}
            autoCapitalize="characters"
            onChange={(e) => setCodesInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitSetCodes(normalizeSetCodes(codesInput));
              }
            }}
          />
        </label>
        <button
          type="button"
          className="db-btn"
          disabled={loading}
          aria-label="Apply set filter"
          onClick={() => commitSetCodes(normalizeSetCodes(codesInput))}
        >
          Apply
        </button>
        <button
          type="button"
          className="db-btn"
          disabled={loading || (!codesInput.trim() && !filterActive)}
          aria-label="Clear set filter"
          onClick={() => commitSetCodes([])}
        >
          Clear
        </button>
      </div>

      <div className="db-picker-scroll" ref={scrollRef}>
        {categoryOptions?.length ? (
          creatingNew ? (
            <label>
              New category
              <input
                className="db-input"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Category name"
                aria-label="New category name"
                autoFocus
              />
            </label>
          ) : (
            <label>
              Category
              <select
                className="db-select"
                value={category}
                onChange={(e) => {
                  if (e.target.value === NEW_CATEGORY_VALUE) {
                    setCreatingNew(true);
                    return;
                  }
                  setCategory(e.target.value);
                }}
              >
                <CategorySelectOptgroups
                  names={categoryOptions}
                  format={format}
                  categoryOrder={categoryOrder}
                />
                <option value={NEW_CATEGORY_VALUE}>New category…</option>
              </select>
            </label>
          )
        ) : null}

        {loading ? <p className="db-muted">Loading printings…</p> : null}
        {error ? <p className="db-error">{error}</p> : null}

        {!loading && !error && prints.length ? (
          <div className="db-picker-grid" role="listbox" aria-label="Printings">
            {prints.map((p) => {
              const src = scryfallCardImageUrl(p);
              const doubleFaced = cardHasBackFace(p.layout);
              const backSrc = doubleFaced ? scryfallImageFromId(p.id, 'back') : null;
              const selected = picked?.id === p.id;
              const label = `${String(p.set || '').toUpperCase()} #${p.collector_number}`;
              const showFoil = foil && printingSupportsFoil(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`db-picker-option${selected ? ' is-selected' : ''}`}
                  title={label}
                  onClick={() => setPicked(p)}
                >
                  <span className="db-picker-option-face">
                    <CardFace
                      src={src}
                      backSrc={backSrc}
                      name={label}
                      foil={showFoil}
                      proxy={proxy}
                      faceKey={p.id}
                      doubleFaced={doubleFaced}
                    />
                  </span>
                  <span className="db-picker-option-meta">{label}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {hasMore ? (
          <div
            ref={sentinelRef}
            className="db-picker-scroll-sentinel"
            aria-hidden="true"
          />
        ) : null}
        {loadingMore ? <p className="db-muted db-picker-loading-more">Loading more…</p> : null}
      </div>

      <div className="db-modal-actions">
        {onBack ? (
          <button type="button" className="db-btn" onClick={onBack}>
            Back
          </button>
        ) : (
          <button type="button" className="db-btn" onClick={onClose}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="db-btn is-active"
          disabled={!picked || (Boolean(categoryOptions) && !resolvedCategory())}
          onClick={confirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );

  if (embedded) return card;

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label={title || 'Choose printing'}>
      {card}
    </div>
  );
}
