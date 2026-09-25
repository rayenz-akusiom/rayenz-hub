import type { ReactNode } from 'react';
import { DbMenu } from '../ui/DbMenu';

export function ScryfallIncludeMenu({
  value,
  paperGame,
  onPaperGameChange,
  children,
}: {
  value: string;
  paperGame: boolean;
  onPaperGameChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="db-search-include">
      <DbMenu label="Include" value={value} ariaLabel="Include in Scryfall search">
        <div
          className="db-search-include-panel"
          role="none"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <label className="db-check">
            <input
              type="checkbox"
              checked={paperGame}
              onChange={(e) => onPaperGameChange(e.target.checked)}
            />
            Paper game
          </label>
          {children}
        </div>
      </DbMenu>
    </div>
  );
}
