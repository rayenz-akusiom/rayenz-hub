import { useState } from 'react';
import type { CollectionTemplate } from '@rayenz-hub/shared';
import type { CreateDialogProps } from '../shared/BuilderApp';
import { createCollectionDocument } from './collection-sync';

export function CreateCollectionDialog({
  onClose,
  onSave,
}: CreateDialogProps) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [template, setTemplate] = useState<CollectionTemplate>('generic');
  const [defaultQuantity, setDefaultQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const doc = await createCollectionDocument({
        name: name.trim() || 'New Collection',
        query,
        defaultQuantity: Math.max(1, Math.floor(Number(defaultQuantity) || 1)),
        template,
      });
      await onSave(doc);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Create collection">
      <div className="db-modal-card">
        <h3>Create collection</h3>
        {error ? <p className="db-error">{error}</p> : null}
        <label>
          Name
          <input className="db-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Template
          <select className="db-select" value={template} onChange={(e) => setTemplate(e.target.value as CollectionTemplate)}>
            <option value="generic">Generic</option>
            <option value="planeswalkers">Planeswalkers</option>
          </select>
        </label>
        <label>
          Scryfall query
          <input
            className="db-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. t:planeswalker or set:sld'
            spellCheck={false}
          />
        </label>
        <label>
          Default target quantity
          <input
            className="db-input"
            type="number"
            min="1"
            step="1"
            value={defaultQuantity}
            onChange={(e) => setDefaultQuantity(e.target.value)}
          />
        </label>
        <div className="db-modal-actions">
          <button type="button" className="db-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="db-btn is-active"
            onClick={() => void create()}
            disabled={busy || !query.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
