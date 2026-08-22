import { useState } from 'react';
import type { DeckDocument } from '@rayenz-hub/shared';
import { buildArchidektImportText } from './to-archidekt';
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

/** Top-right overflow menu for browse actions, duplicate, and Archidekt export. */
export function DeckActionsMenu({
  deck,
  onDuplicate,
  duplicateDisabled,
  onOpenCategories,
  onOpenBasics,
  trimMode,
  onToggleTrim,
  onGenerateGlance,
}: {
  deck: DeckDocument;
  onDeckChange: (next: DeckDocument) => void;
  onDuplicate?: () => void;
  duplicateDisabled?: boolean;
  onOpenCategories?: () => void;
  onOpenBasics?: () => void;
  trimMode?: boolean;
  onToggleTrim?: () => void;
  onGenerateGlance?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = buildArchidektImportText(deck);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <DbMenu
      icon={<HamburgerIcon />}
      ariaLabel="Deck actions"
      align="end"
      triggerClassName="db-btn db-menu-icon-btn"
    >
      {onToggleTrim ? (
        <DbMenuItem
          active={trimMode}
          onSelect={onToggleTrim}
          title="Click cards to move to Maybeboard or delete"
        >
          {trimMode ? 'Exit trim' : 'Trim'}
        </DbMenuItem>
      ) : null}
      {onOpenCategories ? (
        <DbMenuItem onSelect={onOpenCategories}>Categories…</DbMenuItem>
      ) : null}
      {onOpenBasics ? (
        <DbMenuItem onSelect={onOpenBasics}>Basics…</DbMenuItem>
      ) : null}
      {onGenerateGlance ? (
        <DbMenuItem onSelect={onGenerateGlance}>Generate glance</DbMenuItem>
      ) : null}
      {onDuplicate ? (
        <DbMenuItem disabled={duplicateDisabled} onSelect={() => onDuplicate()}>
          Duplicate deck
        </DbMenuItem>
      ) : null}
      <DbMenuItem onSelect={() => void copy()}>{copied ? 'Copied' : 'Copy Archidekt import'}</DbMenuItem>
    </DbMenu>
  );
}
