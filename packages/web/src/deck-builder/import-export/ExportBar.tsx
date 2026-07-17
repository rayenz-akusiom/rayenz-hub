import type { BrowseView, CardLayout } from '@rayenz-hub/shared';
import { CardSizePicker } from '../CardSizePicker';
import type { CardSizeKey } from '../card-size';
import { DbMenu, DbMenuItem } from '../ui/DbMenu';

const VIEW_LABELS: Record<BrowseView, string> = {
  category: 'Categories',
  colour_identity: 'Colour identity',
  colour_identity_spells: 'Colour identity (Spells)',
};

const LAYOUT_LABELS: Record<CardLayout, string> = {
  stacked: 'Stacked',
  grid: 'Grid',
};

export function ExportBar({
  onAddCard,
  view,
  onViewChange,
  layout,
  onLayoutChange,
  cardSize,
  onCardSizeChange,
}: {
  onAddCard?: () => void;
  view: BrowseView;
  onViewChange: (next: BrowseView) => void;
  layout: CardLayout;
  onLayoutChange: (next: CardLayout) => void;
  cardSize: CardSizeKey;
  onCardSizeChange: (next: CardSizeKey) => void;
}) {
  return (
    <div className="db-export-bar">
      {onAddCard ? (
        <button type="button" className="db-btn is-active" onClick={onAddCard}>
          Add card…
        </button>
      ) : null}
      <div className="db-toolbar-controls">
        <DbMenu label="Browse" value={VIEW_LABELS[view]}>
          <DbMenuItem active={view === 'category'} onSelect={() => onViewChange('category')}>
            Categories
          </DbMenuItem>
          <DbMenuItem
            active={view === 'colour_identity'}
            onSelect={() => onViewChange('colour_identity')}
          >
            Colour identity
          </DbMenuItem>
          <DbMenuItem
            active={view === 'colour_identity_spells'}
            onSelect={() => onViewChange('colour_identity_spells')}
          >
            Colour identity (Spells)
          </DbMenuItem>
        </DbMenu>
        <DbMenu label="Layout" value={LAYOUT_LABELS[layout]}>
          <DbMenuItem active={layout === 'stacked'} onSelect={() => onLayoutChange('stacked')}>
            Stacked
          </DbMenuItem>
          <DbMenuItem active={layout === 'grid'} onSelect={() => onLayoutChange('grid')}>
            Grid
          </DbMenuItem>
        </DbMenu>
        <CardSizePicker size={cardSize} onChange={onCardSizeChange} />
      </div>
    </div>
  );
}
