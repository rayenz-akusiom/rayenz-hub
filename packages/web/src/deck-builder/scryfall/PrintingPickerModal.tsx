import { useEffect, useState } from 'react';
import {
  fetchPrintings,
  mapScryfallCardToPrinting,
  printingSupportsFoil,
  scryfallCardImageUrl,
  type PrintingFields,
  type ScryfallCard,
} from '@rayenz-hub/shared';
import { CardFace } from '../browse/CardFace';
import { CardSizePicker } from '../CardSizePicker';

export function PrintingPickerModal({
  cardName,
  defaultScryfallId = null,
  foilDefault = false,
  selectedScryfallId = null,
  categoryOptions,
  defaultCategory,
  confirmLabel = 'Apply',
  title,
  onConfirm,
  onClose,
  onBack,
}: {
  cardName: string;
  defaultScryfallId?: string | null;
  foilDefault?: boolean;
  selectedScryfallId?: string | null;
  /** When set, shows a category select (add flow). */
  categoryOptions?: string[];
  defaultCategory?: string;
  confirmLabel?: string;
  title?: string;
  onConfirm: (printing: PrintingFields, category?: string) => void;
  onClose: () => void;
  onBack?: () => void;
}) {
  const [prints, setPrints] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ScryfallCard | null>(null);
  const [foil, setFoil] = useState(foilDefault);
  const [category, setCategory] = useState(
    defaultCategory || categoryOptions?.[0] || 'Maybeboard',
  );

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

  function confirm() {
    if (!picked) return;
    const printing = mapScryfallCardToPrinting(picked, {
      foil: foil && printingSupportsFoil(picked),
    });
    onConfirm(printing, categoryOptions ? category : undefined);
  }

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label={title || 'Choose printing'}>
      <div className="db-modal-card db-modal-picker">
        <div className="db-picker-header">
          <h3>{title || `Printing — ${cardName}`}</h3>
          <div className="db-picker-header-controls">
            <CardSizePicker />
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

        {categoryOptions?.length ? (
          <label>
            Category
            <select
              className="db-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {loading ? <p className="db-muted">Loading printings…</p> : null}
        {error ? <p className="db-error">{error}</p> : null}

        {!loading && !error ? (
          <div className="db-picker-grid" role="listbox" aria-label="Printings">
            {prints.map((p) => {
              const src = scryfallCardImageUrl(p);
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
                    <CardFace src={src} name={label} foil={showFoil} />
                  </span>
                  <span className="db-picker-option-meta">{label}</span>
                </button>
              );
            })}
          </div>
        ) : null}

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
            disabled={!picked}
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
