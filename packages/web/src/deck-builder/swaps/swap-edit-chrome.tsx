import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  cardDisplayName,
  categoryIncluded,
  defaultAddCategory,
  isSwapQueueCategory,
  resolveDeckCards,
  type DeckDocument,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { CardTile } from '../browse/CardTile';
import { ScryfallSearchModal } from '../scryfall/ScryfallSearchModal';
import { FinalizeSwapConfirmDialog } from './FinalizeSwapConfirm';
import { openOutCardPicker } from './swap-pickers';
import { SwapArrow } from './swap-pair-faces';

export type SwapEditDraft = {
  entryId: string;
  inInstanceId: string | null;
  outInstanceId: string | null;
  inTargetCategory: string | null;
  notes: string;
};

export type SwapEditDeckOption = { deckId: string; deckName: string };

export function draftFromFormalEntry(entry: {
  id: string;
  inInstanceId: string | null;
  outInstanceId: string | null;
  inTargetCategory?: string | null;
  notes?: string | null;
}): SwapEditDraft {
  return {
    entryId: entry.id,
    inInstanceId: entry.inInstanceId,
    outInstanceId: entry.outInstanceId,
    inTargetCategory: entry.inTargetCategory ?? null,
    notes: entry.notes || '',
  };
}

function SwapEditSlot({
  card,
  role,
  onChange,
}: {
  card: ReturnType<typeof resolveDeckCards>[number] | null;
  role: 'out' | 'in';
  onChange: () => void;
}) {
  const roleLabel = role === 'out' ? 'Out' : 'In';
  return (
    <div className="db-swap-edit-slot">
      {card ? (
        <CardTile
          card={card}
          selected={false}
          onSelect={() => onChange()}
          actionLabel={`Change ${roleLabel}`}
        />
      ) : (
        <button
          type="button"
          className="db-swap-edit-empty"
          aria-label={`Choose ${roleLabel}`}
          onClick={onChange}
        >
          Choose
        </button>
      )}
    </div>
  );
}

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

export function SwapEditChrome({
  deck,
  draft,
  onDraftChange,
  onConfirmIn,
  onClose,
  onRemove,
  onFinalize,
  finalizeDisabled,
  deckOptions,
  onDeckChange,
  inLookupDeck,
}: {
  deck: DeckDocument;
  draft: SwapEditDraft;
  onDraftChange: (patch: Partial<SwapEditDraft>) => void;
  onConfirmIn: (printing: PrintingFields, category: string, meta?: { proxy: boolean }) => void;
  onClose: () => void;
  onRemove: () => void;
  /** Commit the swap: remove Out, keep In, drop the queue entry. */
  onFinalize?: () => void;
  /** When true, Finalize is shown but disabled (e.g. retarget in progress). */
  finalizeDisabled?: boolean;
  /** When set, shows a Deck select for retargeting (Swap Queue). */
  deckOptions?: SwapEditDeckOption[];
  onDeckChange?: (deckId: string) => void;
  /** Extra deck used to resolve In when it still lives on the origin after a retarget. */
  inLookupDeck?: DeckDocument | null;
}) {
  const [phase, setPhase] = useState<'edit' | 'in-search' | 'finalize-confirm'>('edit');
  useModalScrollLock(true);

  const byId = new Map(resolveDeckCards(deck).map((c) => [c.instanceId, c]));
  if (inLookupDeck && inLookupDeck.deckId !== deck.deckId) {
    for (const c of resolveDeckCards(inLookupDeck)) {
      if (!byId.has(c.instanceId)) byId.set(c.instanceId, c);
    }
  }
  const inCard = draft.inInstanceId ? byId.get(draft.inInstanceId) || null : null;
  const outCard = draft.outInstanceId ? byId.get(draft.outInstanceId) || null : null;
  const canFinalize = Boolean(
    onFinalize && draft.inInstanceId && draft.outInstanceId && !finalizeDisabled,
  );

  const targetOptions = (deck.categories || [])
    .filter((c) => categoryIncluded(deck.categories, c.name) && !isSwapQueueCategory(c.name))
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  const swapInDefaultCategory = draft.inTargetCategory || defaultAddCategory(deck);

  function pickOut() {
    openOutCardPicker(deck, draft.outInstanceId, (instanceId) => {
      onDraftChange({ outInstanceId: instanceId });
    });
  }

  const dialogLabel =
    phase === 'in-search'
      ? 'Choose In card from Scryfall'
      : phase === 'finalize-confirm'
        ? 'Confirm finalize swap'
        : 'Edit swap';

  return createPortal(
    <div
      className="db-modal"
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {phase === 'in-search' ? (
        <ScryfallSearchModal
          embedded
          deck={deck}
          title="Choose In card from Scryfall"
          confirmLabel="Use as In"
          printingTitle={(name) => `Printing — ${name}`}
          defaultCategory={swapInDefaultCategory}
          onClose={() => setPhase('edit')}
          onAdd={(printing, category, meta) => {
            onConfirmIn(printing, category, meta);
            setPhase('edit');
          }}
        />
      ) : phase === 'finalize-confirm' ? (
        <FinalizeSwapConfirmDialog
          embedded
          outName={outCard ? cardDisplayName(outCard) : 'Out'}
          inName={inCard ? cardDisplayName(inCard) : 'In'}
          category={draft.inTargetCategory}
          onCancel={() => setPhase('edit')}
          onConfirm={() => {
            setPhase('edit');
            onFinalize?.();
          }}
        />
      ) : (
        <div className="db-modal-card db-modal-wide db-swap-edit-chrome" data-testid="swap-queue-edit">
          <h3>Edit swap</h3>
          <div className="db-swap-edit-scroll">
            {deckOptions?.length && onDeckChange ? (
              <label>
                Deck
                <select
                  className="db-select"
                  aria-label="Target deck"
                  value={deck.deckId}
                  onChange={(e) => onDeckChange(e.target.value)}
                >
                  {deckOptions.map((opt) => (
                    <option key={opt.deckId} value={opt.deckId}>
                      {opt.deckName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="db-swap-edit-slots">
              <SwapEditSlot card={outCard} role="out" onChange={pickOut} />
              <SwapArrow />
              <SwapEditSlot card={inCard} role="in" onChange={() => setPhase('in-search')} />
            </div>
            <label>
              Place In card in category
              <select
                className="db-select"
                value={draft.inTargetCategory || ''}
                onChange={(e) => onDraftChange({ inTargetCategory: e.target.value || null })}
              >
                <option value="">— not set —</option>
                {targetOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <input
                className="db-input"
                value={draft.notes}
                onChange={(e) => onDraftChange({ notes: e.target.value })}
              />
            </label>
          </div>
          <div className="db-modal-actions db-swap-edit-actions">
            <div className="db-swap-edit-actions-secondary">
              <button type="button" className="db-btn db-btn-danger" onClick={onRemove}>
                Remove
              </button>
              {onFinalize ? (
                <button
                  type="button"
                  className="db-btn"
                  disabled={!canFinalize}
                  title={
                    finalizeDisabled
                      ? 'Finish the deck change before finalizing'
                      : !draft.inInstanceId || !draft.outInstanceId
                        ? 'Both In and Out are required to finalize'
                        : 'Remove Out and keep In in its target category'
                  }
                  onClick={() => setPhase('finalize-confirm')}
                >
                  Finalize
                </button>
              ) : null}
            </div>
            <button type="button" className="db-btn is-active" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
