import type { BrowseView, CardLayout, CardSortMode } from '@rayenz-hub/shared';
import { CARD_SORT_MODE_LABELS } from '@rayenz-hub/shared';
import { CardSizePicker } from '../CardSizePicker';
import type { CardSizeKey } from '../card-size';
import { DbMenu, DbMenuItem } from '../ui/DbMenu';
import {
  FlagFilterMenu,
  type FlagFilterMode,
} from '../ui/FlagFilterControl';
import { SetFilterMenu, type SetMembershipFilterState } from '../ui/SetFilterControl';

const VIEW_LABELS: Record<BrowseView, string> = {
  category: 'Categories',
  category_custom: 'Categories (Custom)',
  category_multi: 'Multiple categories',
  colour_identity: 'Colour identity',
  colour_identity_spells: 'Colour identity (Spells)',
  unified_list: 'Unified List',
};

const LAYOUT_LABELS: Record<CardLayout, string> = {
  stacked: 'Stacked',
  grid: 'Grid',
};

const SORT_MODES: CardSortMode[] = [
  'name_asc',
  'name_desc',
  'colour_identity',
  'mana_asc',
  'mana_desc',
];

export function ExportBar({
  view,
  onViewChange,
  layout,
  onLayoutChange,
  cardSort,
  onCardSortChange,
  cardSize,
  onCardSizeChange,
  onOpenCategories,
  onOpenBasics,
  setFilter,
  proxyFilter,
  onProxyFilterChange,
  foilFilter,
  onFoilFilterChange,
}: {
  view: BrowseView;
  onViewChange: (next: BrowseView) => void;
  layout: CardLayout;
  onLayoutChange: (next: CardLayout) => void;
  cardSort: CardSortMode;
  onCardSortChange: (next: CardSortMode) => void;
  cardSize: CardSizeKey;
  onCardSizeChange: (next: CardSizeKey) => void;
  onOpenCategories?: () => void;
  onOpenBasics?: () => void;
  setFilter?: SetMembershipFilterState;
  proxyFilter?: FlagFilterMode;
  onProxyFilterChange?: (next: FlagFilterMode) => void;
  foilFilter?: FlagFilterMode;
  onFoilFilterChange?: (next: FlagFilterMode) => void;
}) {
  return (
    <div className="db-toolbar-controls">
      <DbMenu label="Browse" value={VIEW_LABELS[view]}>
        <DbMenuItem active={view === 'category'} onSelect={() => onViewChange('category')}>
          Categories
        </DbMenuItem>
        <DbMenuItem
          active={view === 'category_custom'}
          onSelect={() => onViewChange('category_custom')}
        >
          Categories (Custom)
        </DbMenuItem>
        <DbMenuItem
          active={view === 'category_multi'}
          onSelect={() => onViewChange('category_multi')}
        >
          Multiple categories
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
        <DbMenuItem active={view === 'unified_list'} onSelect={() => onViewChange('unified_list')}>
          Unified List
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
      <DbMenu label="Sort" value={CARD_SORT_MODE_LABELS[cardSort]}>
        {SORT_MODES.map((mode) => (
          <DbMenuItem
            key={mode}
            active={cardSort === mode}
            onSelect={() => onCardSortChange(mode)}
          >
            {CARD_SORT_MODE_LABELS[mode]}
          </DbMenuItem>
        ))}
      </DbMenu>
      {setFilter ? <SetFilterMenu filter={setFilter} /> : null}
      {proxyFilter != null && onProxyFilterChange ? (
        <FlagFilterMenu
          label="Proxy"
          mode={proxyFilter}
          onModeChange={onProxyFilterChange}
        />
      ) : null}
      {foilFilter != null && onFoilFilterChange ? (
        <FlagFilterMenu label="Foil" mode={foilFilter} onModeChange={onFoilFilterChange} />
      ) : null}
      <CardSizePicker size={cardSize} onChange={onCardSizeChange} />
      {onOpenCategories ? (
        <button type="button" className="db-btn" onClick={onOpenCategories}>
          Categories…
        </button>
      ) : null}
      {onOpenBasics ? (
        <button type="button" className="db-btn" onClick={onOpenBasics}>
          Basics…
        </button>
      ) : null}
    </div>
  );
}
