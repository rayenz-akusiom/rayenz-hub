import { useState } from 'react';
import type { DeckDocument } from '@rayenz-hub/shared';
import { buildArchidektImportText } from './to-archidekt';
import { canStageApply, getParentArchidektBridge } from './archidekt-bridge';
import { RefreshDialog } from './RefreshDialog';

export function ExportBar({
  deck,
  onDeckChange,
  onAddCard,
}: {
  deck: DeckDocument;
  onDeckChange: (next: DeckDocument) => void;
  onAddCard?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const text = buildArchidektImportText(deck);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function apply() {
    const bridge = getParentArchidektBridge();
    const id = deck.archidektId || deck.deckId;
    bridge?.stageApply?.(id, text);
    onDeckChange({
      ...deck,
      lastArchidektSyncAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="db-export-bar">
      {onAddCard ? (
        <button type="button" className="db-btn is-active" onClick={onAddCard}>
          Add card…
        </button>
      ) : null}
      <button type="button" className="db-btn" onClick={copy}>
        {copied ? 'Copied' : 'Copy Archidekt import'}
      </button>
      <button type="button" className="db-btn is-active" onClick={apply} disabled={!canStageApply()}>
        Apply via bridge
      </button>
      <button type="button" className="db-btn" onClick={() => setRefreshOpen(true)}>
        Refresh from Archidekt…
      </button>
      {refreshOpen ? (
        <RefreshDialog
          deck={deck}
          onClose={() => setRefreshOpen(false)}
          onApplied={(next) => {
            onDeckChange(next);
            setRefreshOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
