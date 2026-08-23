import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  cardDisplayName,
  SEEKING,
  resolveDeckCards,
  type DeckDocument,
  type PrintingFields,
  type WantSource,
} from '@rayenz-hub/shared';
import { CardTile } from '../deck-builder/browse/CardTile';
import { ScryfallSearchModal } from '../deck-builder/scryfall/ScryfallSearchModal';
import { useDialogA11y } from '../ui/useDialogA11y';

export type LookingForDeckOption = { deckId: string; deckName: string };

function useModalScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const main = document.querySelector('.hub-main') as HTMLElement | null;
    const prevMain = main?.style.overflow ?? '';
    const prevBody = document.body.style.overflow;
    if (main) main.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      if (main) main.style.overflow = prevMain;
      document.body.style.overflow = prevBody;
    };
  }, [active]);
}

export function LookingForEditChrome({
  deck,
  source,
  onClose,
  onRemove,
  onReplace,
  deckOptions,
  onRetarget,
}: {
  deck: DeckDocument;
  source: WantSource;
  onClose: () => void;
  onRemove: () => void;
  onReplace: (printing: PrintingFields, meta?: { proxy: boolean }) => void;
  deckOptions?: LookingForDeckOption[];
  onRetarget?: (deckId: string) => void;
}) {
  const [phase, setPhase] = useState<'edit' | 'replace'>('edit');
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalScrollLock(true);
  useDialogA11y(true, onClose, dialogRef);

  const card =
    resolveDeckCards(deck).find((c) => c.instanceId === source.cardInstanceId) || null;
  const name = card ? cardDisplayName(card) : source.cardName;

  return createPortal(
    <div ref={dialogRef} className="db-modal" role="dialog" aria-modal="true" aria-label="Edit Seeking">
      {phase === 'replace' ? (
        <ScryfallSearchModal
          embedded
          deck={deck}
          title="Replace Seeking card"
          confirmLabel="Use as Seeking"
          defaultCategory={SEEKING}
          onClose={() => setPhase('edit')}
          onAdd={(printing, _category, meta) => {
            onReplace(printing, meta);
          }}
        />
      ) : (
        <div className="db-modal-card db-swap-edit-chrome" data-testid="swap-queue-edit">
          <h3>Seeking · {name}</h3>
          {deckOptions?.length && onRetarget ? (
            <label className="sq-seeking-deck">
              Deck
              <select
                className="db-select"
                aria-label="Target deck"
                value={deck.deckId}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next && next !== deck.deckId) onRetarget(next);
                }}
              >
                {deckOptions.map((opt) => (
                  <option key={opt.deckId} value={opt.deckId}>
                    {opt.deckName}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="hub-muted">{deck.name}</p>
          )}
          <div className="db-swap-edit-scroll">
            {card ? <CardTile card={card} selected={false} /> : null}
          </div>
          <div className="db-modal-actions">
            <button type="button" className="db-btn db-btn-danger" onClick={onRemove}>
              Remove
            </button>
            <button type="button" className="db-btn" onClick={() => setPhase('replace')}>
              Replace
            </button>
            <button type="button" className="db-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
