import { useState } from 'react';
import type { DeckDocument } from '@rayenz-hub/shared';
import { buildArchidektImportText } from './to-archidekt';
import { canStageApply, getParentArchidektBridge } from './archidekt-bridge';
import { RefreshDialog } from './RefreshDialog';
import { DbMenu, DbMenuItem } from '../ui/DbMenu';

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 4.5h12v1.5H3V4.5zm0 4h12v1.5H3V8.5zm0 4h12V14H3v-1.5z"
      />
    </svg>
  );
}

/** Top-right overflow menu for Archidekt sync/export actions. */
export function DeckActionsMenu({
  deck,
  onDeckChange,
}: {
  deck: DeckDocument;
  onDeckChange: (next: DeckDocument) => void;
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
    <>
      <DbMenu
        icon={<HamburgerIcon />}
        ariaLabel="Deck actions"
        align="end"
        triggerClassName="db-btn db-menu-icon-btn"
      >
        <DbMenuItem onSelect={() => void copy()}>
          {copied ? 'Copied' : 'Copy Archidekt import'}
        </DbMenuItem>
        <DbMenuItem onSelect={apply} disabled={!canStageApply()}>
          Apply via bridge
        </DbMenuItem>
        <DbMenuItem onSelect={() => setRefreshOpen(true)}>Refresh from Archidekt…</DbMenuItem>
      </DbMenu>
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
    </>
  );
}
