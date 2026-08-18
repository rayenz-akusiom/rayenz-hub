import { useState } from 'react';
import { applyForcedFormat, type DeckDocument } from '@rayenz-hub/shared';
import { documentFromImportText } from '../import-export/import-deck';
import type { CreateDialogProps } from '../shared/BuilderApp';

export function CreateCommanderDialog({
  onClose,
  onSave,
  formatMismatchWarning,
  onMismatchWarning,
}: CreateDialogProps) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finalize(doc: DeckDocument) {
    const { document, formatMismatchWarning: warning } = applyForcedFormat(doc, 'commander');
    onMismatchWarning?.(warning);
    await onSave(document);
    onClose();
  }

  async function savePaste() {
    setBusy(true);
    setError(null);
    try {
      const doc = documentFromImportText(text, { name: name || undefined });
      await finalize(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Create Commander deck">
      <div className="db-modal-card db-modal-wide">
        <h3>Create Commander deck</h3>
        {formatMismatchWarning ? <p className="db-warn">{formatMismatchWarning}</p> : null}
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
      </div>
    </div>
  );
}
