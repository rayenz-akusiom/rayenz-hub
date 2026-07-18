import { useEffect, useState } from 'react';
import {
  canonicalizeCategoryName,
  cardHasBackFace,
  fetchPrintings,
  mapScryfallCardToPrinting,
  printingSupportsFoil,
  scryfallCardImageUrl,
  scryfallImageFromId,
  type PrintingFields,
  type ScryfallCard,
} from '@rayenz-hub/shared';
import { CardFace } from '../browse/CardFace';
import { CardSizePicker } from '../CardSizePicker';

const NEW_CATEGORY_VALUE = '__new__';

export function PrintingPickerModal({
  cardName,
  defaultScryfallId = null,
  foilDefault = false,
  proxyDefault = false,
  selectedScryfallId = null,
  categoryOptions,
  defaultCategory,
  confirmLabel = 'Apply',
  title,
  onConfirm,
  onClose,
  onBack,
  embedded = false,
}: {
  cardName: string;
  defaultScryfallId?: string | null;
  foilDefault?: boolean;
  proxyDefault?: boolean;
  selectedScryfallId?: string | null;
  /** When set, shows a category select (add flow). */
  categoryOptions?: string[];
  defaultCategory?: string;
  confirmLabel?: string;
  title?: string;
  onConfirm: (
    printing: PrintingFields,
    category?: string,
    meta?: { proxy: boolean },
  ) => void;
  onClose: () => void;
  onBack?: () => void;
  /** Skip outer `.db-modal` backdrop (host provides the shell). */
  embedded?: boolean;
}) {
  const [prints, setPrints] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ScryfallCard | null>(null);
  const [foil, setFoil] = useState(foilDefault);
  const [proxy, setProxy] = useState(proxyDefault);
  const [category, setCategory] = useState(
    defaultCategory || categoryOptions?.[0] || 'Maybeboard',
  );
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPicked(null);
    fetchPrintings(cardName, { defaultScryfallId })
      .then((list) => {
        if (cancelled) return;
        setPrints(list);
        const preferred =
          list.find((p) => p.id === selectedScryfallId) ||
          list.find((p) => p.id === defaultScryfallId) ||
          list[0] ||
          null;
        setPicked(preferred);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load printings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardName, defaultScryfallId, selectedScryfallId]);

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
    <div className="db-modal-card db-modal-picker">
      <div className="db-picker-header">
        <h3>{title || `Printing — ${cardName}`}</h3>
        <div className="db-picker-header-controls">
          <CardSizePicker />
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

      <div className="db-picker-scroll">
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
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={NEW_CATEGORY_VALUE}>New category…</option>
              </select>
            </label>
          )
        ) : null}

        {loading ? <p className="db-muted">Loading printings…</p> : null}
        {error ? <p className="db-error">{error}</p> : null}

        {!loading && !error ? (
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
