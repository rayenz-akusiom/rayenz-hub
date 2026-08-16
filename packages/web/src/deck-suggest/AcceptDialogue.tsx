import { useMemo, useState } from 'react';
import type { DeckDocument } from '@rayenz-hub/shared';
import type { Suggestion } from './types';
import { legalOutCards } from './accept';

type Props = {
  suggestion: Suggestion;
  deck: DeckDocument | null;
  theory: boolean;
  protectedCards?: string[];
  onCancel: () => void;
  onSwap: (outInstanceId: string) => void;
  onSeeking: () => void;
};

export function AcceptDialogue({ suggestion, deck, theory, protectedCards, onCancel, onSwap, onSeeking }: Props) {
  const [mode, setMode] = useState<'swap' | 'seeking'>('swap');
  const outs = useMemo(() => (deck ? legalOutCards(deck, protectedCards) : []), [deck, protectedCards]);
  const prefill = suggestion.replaces?.[0]?.name;
  const prefillId = outs.find((o) => o.name === prefill)?.instanceId || '';
  const [outId, setOutId] = useState(prefillId);
  const disabled = theory;

  function save() {
    if (disabled) return;
    if (mode === 'seeking') {
      onSeeking();
      return;
    }
    if (!outId) return;
    onSwap(outId);
  }

  return (
    <div className="ds-accept" role="dialog" aria-label="Accept suggestion">
      <p>
        <strong>{suggestion.card.name}</strong>
      </p>
      {disabled ? (
        <p className="ds-meta">Theory decks have read-only queues — Swap Queue and Seeking are disabled.</p>
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
      <div className="ds-actions">
        <button type="button" className="ds-btn ds-btn-primary" disabled={disabled || (mode === 'swap' && !outId)} onClick={save}>
          Save
        </button>
        <button type="button" className="ds-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
