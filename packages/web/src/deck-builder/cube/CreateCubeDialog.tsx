import { useState } from 'react';
import { applyForcedFormat, type CategoryDef, type DeckDocument } from '@rayenz-hub/shared';
import { canStageApply, getParentArchidektBridge, isBridgeAvailable } from '../import-export/archidekt-bridge';
import {
  documentFromArchidektSnapshot,
  documentFromImportText,
  emptyDeckDocument,
} from '../import-export/import-deck';
import type { CreateDialogProps } from '../shared/BuilderApp';

const DEFAULT_CUBE_CATEGORIES: CategoryDef[] = [
  { name: 'Maybeboard', includedInDeck: false, includedInPrice: false },
  { name: 'White', includedInDeck: true, includedInPrice: true },
  { name: 'Blue', includedInDeck: true, includedInPrice: true },
  { name: 'Black', includedInDeck: true, includedInPrice: true },
  { name: 'Red', includedInDeck: true, includedInPrice: true },
  { name: 'Green', includedInDeck: true, includedInPrice: true },
  { name: 'Multicolor', includedInDeck: true, includedInPrice: true },
  { name: 'Colorless', includedInDeck: true, includedInPrice: true },
  { name: 'Lands', includedInDeck: true, includedInPrice: true },
];

export function CreateCubeDialog({
  onClose,
  onSave,
  formatMismatchWarning,
  onMismatchWarning,
}: CreateDialogProps) {
  const [name, setName] = useState('');
  const [targetSize, setTargetSize] = useState('360');
  const [text, setText] = useState('');
  const [deckUrl, setDeckUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bridgeOk = isBridgeAvailable();

  function parseTargetSize(): number {
    const n = parseInt(targetSize, 10);
    return Number.isFinite(n) && n > 0 ? n : 360;
  }

  async function finalize(doc: DeckDocument) {
    const sized = {
      ...doc,
      cubeTargetSize: doc.cubeTargetSize ?? parseTargetSize(),
      browseViewDefault: doc.browseViewDefault ?? 'colour_identity',
    };
    const { document, formatMismatchWarning: warning } = applyForcedFormat(sized, 'cube');
    onMismatchWarning?.(warning);
    await onSave(document);
    onClose();
  }

  async function saveEmpty() {
    setBusy(true);
    setError(null);
    try {
      const deckName = name.trim() || 'New cube';
      const doc = emptyDeckDocument({
        name: deckName,
        format: 'cube',
        cubeTargetSize: parseTargetSize(),
        browseViewDefault: 'colour_identity',
        categories: DEFAULT_CUBE_CATEGORIES,
      });
      await finalize(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function savePaste() {
    setBusy(true);
    setError(null);
    try {
      const doc = documentFromImportText(text, {
        name: name.trim() || undefined,
      });
      await finalize({
        ...doc,
        cubeTargetSize: parseTargetSize(),
        browseViewDefault: doc.browseViewDefault ?? 'colour_identity',
      });
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
      await finalize({
        ...doc,
        cubeTargetSize: parseTargetSize(),
        browseViewDefault: doc.browseViewDefault ?? 'colour_identity',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const hasImport = text.trim().length > 0 || deckUrl.trim().length > 0;

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Create cube">
      <div className="db-modal-card db-modal-wide">
        <h3>Create cube</h3>
        {formatMismatchWarning ? <p className="db-warn">{formatMismatchWarning}</p> : null}
        {error ? <p className="db-error">{error}</p> : null}
        <label>
          Name
          <input className="db-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Target size
          <input
            className="db-input"
            type="number"
            min={1}
            value={targetSize}
            onChange={(e) => setTargetSize(e.target.value)}
          />
        </label>
        <p className="db-meta">Default browse view: colour identity. Empty cubes seed basic section categories.</p>
        <label>
          Archidekt import text (optional)
          <textarea
            className="db-textarea"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'[White]\n1 Plains\n...'}
          />
        </label>
        <div className="db-modal-actions">
          <button type="button" className="db-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {!hasImport ? (
            <button
              type="button"
              className="db-btn is-active"
              onClick={saveEmpty}
              disabled={busy}
            >
              Create empty cube
            </button>
          ) : (
            <button
              type="button"
              className="db-btn is-active"
              onClick={savePaste}
              disabled={busy || !text.trim()}
            >
              Import paste
            </button>
          )}
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
