import { useState, type FormEvent } from 'react';
import {
  cardHasBackFace,
  defaultAddCategory,
  deckCategoryOptions,
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

export function ScryfallSearchModal({
  deck,
  onClose,
  onAdd,
  title = 'Add card from Scryfall',
  confirmLabel = 'Add to deck',
  printingTitle,
  defaultCategory,
  embedded = false,
}: {
  deck: DeckDocument;
  onClose: () => void;
  onAdd: (printing: PrintingFields, category: string) => void;
  title?: string;
  confirmLabel?: string;
  /** Title for the nested printing step; defaults to `Add — {name}` / confirm-based. */
  printingTitle?: (cardName: string) => string;
  defaultCategory?: string;
  /** Skip outer `.db-modal` backdrop (host provides the shell). */
  embedded?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ScryfallCard | null>(null);

  const categories = deckCategoryOptions(deck);
  const defaultCat = defaultCategory || defaultAddCategory(deck);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) {
      setError('Enter a Scryfall search query.');
      return;
    }
    setLoading(true);
    setError(null);
    setPending(null);
    try {
      const page1 = await searchCards(q, 1);
      setResults(page1.data);
      setHasMore(page1.has_more);
      setNextPage(page1.next_page);
      setPage(1);
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

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const next = nextPage
        ? await searchCardsNextPage(nextPage)
        : await searchCards(query.trim(), page + 1);
      setResults((prev) => [...prev, ...next.data]);
      setHasMore(next.has_more);
      setNextPage(next.next_page);
      setPage((p) => p + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load more.');
    } finally {
      setLoading(false);
    }
  }

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
        onConfirm={(printing, category) => {
          onAdd(printing, category || defaultCat);
        }}
      />
    );
  }

  const card = (
    <div className="db-modal-card db-modal-picker">
      <div className="db-picker-header">
        <h3>{title}</h3>
        <div className="db-picker-header-controls">
          <CardSizePicker />
          <button type="button" className="db-btn" onClick={onClose}>
            {embedded ? 'Back' : 'Close'}
          </button>
        </div>
      </div>

      <div className="db-picker-scroll">
        <form className="db-search-form" onSubmit={runSearch}>
          <label className="db-search-label">
            Scryfall query
            <input
              className="db-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='e.g. t:creature id:wubrg o:"draw a card"'
              autoFocus
              spellCheck={false}
            />
          </label>
          <button type="submit" className="db-btn is-active" disabled={loading}>
            Search
          </button>
        </form>

        <p className="db-muted db-search-hint">
          Uses Scryfall search syntax. Pick a card, then choose a printing.
        </p>

        {error ? <p className="db-error">{error}</p> : null}
        {loading && !results.length ? <p className="db-muted">Searching…</p> : null}

        {results.length ? (
          <div className="db-picker-grid" role="listbox" aria-label="Search results">
            {results.map((cardResult) => {
              const src = scryfallCardImageUrl(cardResult);
              const doubleFaced = cardHasBackFace(cardResult.layout);
              const backSrc = doubleFaced ? scryfallImageFromId(cardResult.id, 'back') : null;
              return (
                <button
                  key={cardResult.id}
                  type="button"
                  role="option"
                  className="db-picker-option"
                  title={cardResult.name}
                  onClick={() => setPending(cardResult)}
                >
                  <span className="db-picker-option-face">
                    <CardFace
                      src={src}
                      backSrc={backSrc}
                      name={cardResult.name}
                      faceKey={cardResult.id}
                      doubleFaced={doubleFaced}
                    />
                  </span>
                  <span className="db-picker-option-meta">{cardResult.name}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {hasMore ? (
        <div className="db-modal-actions">
          <button type="button" className="db-btn" disabled={loading} onClick={loadMore}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
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
