import { useState } from 'react';
import { documentFromImportText } from '../import-export/import-deck';
import type { DeckDocument } from '@rayenz-hub/shared';
import { canStageApply, getParentArchidektBridge, isBridgeAvailable } from '../import-export/archidekt-bridge';
import { documentFromArchidektSnapshot } from '../import-export/import-deck';

export function AddDeckDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (doc: DeckDocument) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [deckUrl, setDeckUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bridgeOk = isBridgeAvailable();

  async function savePaste() {
    setBusy(true);
    setError(null);
    try {
      const doc = documentFromImportText(text, { name: name || undefined });
      await onSave(doc);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveBridge() {
    setBusy(true);
    setError(null);
    try {
      const match = deckUrl.match(/archidekt\.com\/decks\/(\d+)/);
      const id = match ? match[1] : deckUrl.trim();
      if (!id) throw new Error('Enter an Archidekt deck URL or id');
      const bridge = getParentArchidektBridge();
      if (!bridge?.fetchDeckSnapshot) throw new Error('Bridge fetchDeckSnapshot unavailable');
      const snap = (await bridge.fetchDeckSnapshot(id)) as Record<string, unknown>;
      const doc = documentFromArchidektSnapshot(
        {
          ...snap,
          deck_id: snap.deck_id || snap.id || id,
          url: deckUrl || undefined,
        },
        null,
        { nameOverride: name.trim() || undefined },
      );
      await onSave(doc);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Add deck">
      <div className="db-modal-card db-modal-wide">
        <h3>Add deck</h3>
        {error ? <p className="db-error">{error}</p> : null}
        <label>
          Name (optional)
          <input className="db-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Archidekt import text
          <textarea
            className="db-textarea"
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'[Creature]\n1 Sol Ring\n...'}
          />
        </label>
        <div className="db-modal-actions">
          <button type="button" className="db-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="db-btn is-active" onClick={savePaste} disabled={busy || !text.trim()}>
            Import paste
          </button>
        </div>
        <hr />
        <label>
          Archidekt deck URL
          <input
            className="db-input"
            value={deckUrl}
            onChange={(e) => setDeckUrl(e.target.value)}
            placeholder="https://archidekt.com/decks/…"
            disabled={!bridgeOk}
          />
        </label>
        <p className="db-meta">
          {bridgeOk
            ? `Bridge available${canStageApply() ? ' (apply supported)' : ''}.`
            : 'Install the Archidekt bridge userscript to fetch live decks.'}
        </p>
        <div className="db-modal-actions">
          <button
            type="button"
            className="db-btn is-active"
            onClick={saveBridge}
            disabled={busy || !bridgeOk || !deckUrl.trim()}
          >
            Fetch from Archidekt
          </button>
        </div>
      </div>
    </div>
  );
}
