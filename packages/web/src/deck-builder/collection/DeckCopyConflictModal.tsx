import { useMemo, useRef, useState } from 'react';
import { CardFace } from '../../cards/CardFace';
import { useDialogA11y } from '../../ui/useDialogA11y';
import type { CollectionDeckSyncConflict, DeckCopy } from './sync-from-decks';

export function DeckCopyConflictModal({
  conflicts,
  onClose,
  onConfirm,
}: {
  conflicts: CollectionDeckSyncConflict[];
  onClose: () => void;
  onConfirm: (chosen: DeckCopy[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  useDialogA11y(true, onClose, rootRef);

  const selectedByName = useMemo(() => {
    const counts = new Map<string, number>();
    for (const conflict of conflicts) {
      let n = 0;
      for (const copy of conflict.copies) {
        if (selected.has(copy.copyId)) n += 1;
      }
      counts.set(conflict.nameKey, n);
    }
    return counts;
  }, [conflicts, selected]);

  function toggle(conflict: CollectionDeckSyncConflict, copy: DeckCopy) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(copy.copyId)) {
        next.delete(copy.copyId);
        return next;
      }
      const count = [...conflict.copies].filter((row) => next.has(row.copyId)).length;
      if (count >= conflict.needed) return prev;
      next.add(copy.copyId);
      return next;
    });
  }

  const chosen = conflicts.flatMap((conflict) =>
    conflict.copies.filter((copy) => selected.has(copy.copyId)),
  );

  return (
    <div
      ref={rootRef}
      className="db-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Choose collection copies"
    >
      <div className="db-modal-card db-modal-picker db-modal-wide">
        <h3>Choose copies from decks</h3>
        <p className="db-muted">
          Some cards appear in more decks than this binder still needs. Pick which printings to
          mark collected.
        </p>
        <div className="db-picker-scroll">
          {conflicts.map((conflict) => {
            const picked = selectedByName.get(conflict.nameKey) || 0;
            return (
              <section key={conflict.nameKey} className="db-collection-sync-conflict">
                <h4>
                  {conflict.name}{' '}
                  <span className="db-muted">
                    {picked}/{conflict.needed}
                  </span>
                </h4>
                <div className="db-picker-grid" role="listbox" aria-multiselectable="true" aria-label={conflict.name}>
                  {conflict.copies.map((copy) => {
                    const isOn = selected.has(copy.copyId);
                    const setLabel = copy.setCode
                      ? `${copy.setCode.toUpperCase()}${copy.collectorNumber ? ` #${copy.collectorNumber}` : ''}`
                      : 'Unknown printing';
                    return (
                      <button
                        key={copy.copyId}
                        type="button"
                        role="option"
                        aria-selected={isOn}
                        className={`db-picker-option${isOn ? ' is-selected' : ''}`}
                        title={`${setLabel} · ${copy.deckName}`}
                        onClick={() => toggle(conflict, copy)}
                      >
                        <span className="db-picker-option-face">
                          <CardFace
                            src={copy.imageUrl}
                            name={copy.name}
                            foil={copy.foil}
                            faceKey={copy.copyId}
                          />
                        </span>
                        <span className="db-picker-option-meta">
                          {setLabel}
                          <br />
                          {copy.deckName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <div className="db-modal-actions">
          <button type="button" className="db-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="db-btn is-active"
            onClick={() => onConfirm(chosen)}
          >
            Apply selected
          </button>
        </div>
      </div>
    </div>
  );
}
