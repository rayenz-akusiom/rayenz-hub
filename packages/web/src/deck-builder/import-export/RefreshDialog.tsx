import { useState } from 'react';
import type { DeckDocument } from '@rayenz-hub/shared';
import { getParentArchidektBridge, isBridgeAvailable } from './archidekt-bridge';
import { documentFromArchidektSnapshot } from './import-deck';

export function RefreshDialog({
  deck,
  onClose,
  onApplied,
}: {
  deck: DeckDocument;
  onClose: () => void;
  onApplied: (next: DeckDocument) => void;
}) {
  const [clearSwaps, setClearSwaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      if (!isBridgeAvailable()) throw new Error('Archidekt bridge unavailable');
      const id = deck.archidektId || deck.deckId;
      const bridge = getParentArchidektBridge();
      if (!bridge?.fetchDeckSnapshot) throw new Error('fetchDeckSnapshot unavailable');
      const snap = (await bridge.fetchDeckSnapshot(id)) as Record<string, unknown>;
      const next = documentFromArchidektSnapshot(
        { ...snap, deck_id: snap.deck_id || snap.id || id, url: deck.archidektUrl || undefined },
        deck,
        { clearSwaps },
      );
      onApplied(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Refresh from Archidekt">
      <div className="db-modal-card">
        <h3>Refresh from Archidekt</h3>
        <p>
          This replaces Hub deck structure from Archidekt. Formal swap pairings are kept by default.
        </p>
        <label className="db-check">
          <input type="checkbox" checked={clearSwaps} onChange={(e) => setClearSwaps(e.target.checked)} />
          Also clear formal swap pairings
        </label>
        {error ? <p className="db-error">{error}</p> : null}
        <div className="db-modal-actions">
          <button type="button" className="db-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="db-btn is-active" onClick={run} disabled={busy}>
            Replace structure
          </button>
        </div>
      </div>
    </div>
  );
}
