import { useEffect, useState } from 'react';
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
}: {
  deck: DeckDocument;
  source: WantSource;
  onClose: () => void;
  onRemove: () => void;
  onReplace: (printing: PrintingFields, meta?: { proxy: boolean }) => void;
}) {
  const [phase, setPhase] = useState<'edit' | 'replace'>('edit');
  useModalScrollLock(true);

  const card =
    resolveDeckCards(deck).find((c) => c.instanceId === source.cardInstanceId) || null;
  const name = card ? cardDisplayName(card) : source.cardName;

  return createPortal(
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Edit Seeking">
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
          <p className="hub-muted">{deck.name}</p>
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
