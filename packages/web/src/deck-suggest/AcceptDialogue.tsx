import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DeckDocument, PrintingFields } from '@rayenz-hub/shared';
import { PrintingPickerModal } from '../deck-builder/scryfall/PrintingPickerModal';
import type { Suggestion } from './types';
import { legalOutCards, type AcceptPrintingChoice } from './accept';

type Props = {
  suggestion: Suggestion;
  deck: DeckDocument | null;
  theory: boolean;
  protectedCards?: string[];
  onCancel: () => void;
  onSwap: (outInstanceId: string, choice: AcceptPrintingChoice) => void;
  onSeeking: (choice: AcceptPrintingChoice) => void;
};

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

export function AcceptDialogue({
  suggestion,
  deck,
  theory,
  protectedCards,
  onCancel,
  onSwap,
  onSeeking,
}: Props) {
  const [mode, setMode] = useState<'swap' | 'seeking'>('swap');
  const [phase, setPhase] = useState<'destination' | 'printing'>('destination');
  const outs = useMemo(() => (deck ? legalOutCards(deck, protectedCards) : []), [deck, protectedCards]);
  const prefill = suggestion.replaces?.[0]?.name;
  const prefillId = outs.find((o) => o.name === prefill)?.instanceId || '';
  const [outId, setOutId] = useState(prefillId);
  const disabled = theory;
  useModalScrollLock(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function continueToPrinting() {
    if (disabled) return;
    if (mode === 'swap' && !outId) return;
    setPhase('printing');
  }

  function onPrintingConfirm(printing: PrintingFields, _category?: string, meta?: { proxy: boolean }) {
    const choice: AcceptPrintingChoice = { printing, proxy: Boolean(meta?.proxy) };
    if (mode === 'seeking') {
      onSeeking(choice);
      return;
    }
    if (!outId) return;
    onSwap(outId, choice);
  }

  const confirmLabel = mode === 'seeking' ? 'Mark as Seeking' : 'Add to Swap Queue';

  return createPortal(
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Accept suggestion">
      {phase === 'printing' ? (
        <PrintingPickerModal
          cardName={suggestion.card.name}
          defaultScryfallId={suggestion.card.scryfall_id || null}
          confirmLabel={confirmLabel}
          title={confirmLabel}
          onConfirm={onPrintingConfirm}
          onClose={onCancel}
          onBack={() => setPhase('destination')}
        />
      ) : (
        <div className="db-modal-card ds-accept-card">
          <h3>Accept · {suggestion.card.name}</h3>
          {disabled ? (
            <p className="ds-meta">
              Theory decks have read-only queues — Swap Queue and Seeking are disabled.
            </p>
          ) : null}
          <label className="ds-field">
            <input
              type="radio"
              name="ds-accept-dest"
              checked={mode === 'swap'}
              disabled={disabled}
              onChange={() => setMode('swap')}
            />{' '}
            Add to Swap Queue
          </label>
          {mode === 'swap' ? (
            <label className="ds-field">
              Out card
              <select
                value={outId}
                disabled={disabled}
                onChange={(e) => setOutId(e.target.value)}
                aria-label="Out card"
              >
                <option value="">Select Out…</option>
                {outs.map((o) => (
                  <option key={o.instanceId} value={o.instanceId}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="ds-field">
            <input
              type="radio"
              name="ds-accept-dest"
              checked={mode === 'seeking'}
              disabled={disabled}
              onChange={() => setMode('seeking')}
            />{' '}
            Mark as Seeking
          </label>
          <div className="db-modal-actions">
            <button type="button" className="db-btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="db-btn is-active"
              disabled={disabled || (mode === 'swap' && !outId)}
              onClick={continueToPrinting}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
