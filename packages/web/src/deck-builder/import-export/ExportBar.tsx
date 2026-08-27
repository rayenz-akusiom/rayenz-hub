import type { BrowseView, CardLayout, CardSortMode } from '@rayenz-hub/shared';
import { CARD_SORT_MODE_LABELS } from '@rayenz-hub/shared';
import { CardSizePicker } from '../CardSizePicker';
import type { CardSizeKey } from '../card-size';
import { DbMenu, DbMenuItem } from '../ui/DbMenu';
import {
  FlagFilterRow,
  FLAG_FILTER_MODE_LABELS,
  type FlagFilterMode,
} from '../ui/FlagFilterControl';
import { FiltersMenu, filtersMenuLabel } from '../ui/FiltersMenu';
import { SetFilterMenuControl, type SetMembershipFilterState } from '../ui/SetFilterControl';
import {
  SyntaxFilterControl,
  type ScryfallSyntaxFilterState,
} from '../ui/SyntaxFilterControl';

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
  setFilter,
  syntaxFilter,
  proxyFilter,
  onProxyFilterChange,
  foilFilter,
  onFoilFilterChange,
  seekingFilter,
  onSeekingFilterChange,
  cardCharmsEnabled,
  onCardCharmsEnabledChange,
}: {
  view: BrowseView;
  onViewChange: (next: BrowseView) => void;
  layout: CardLayout;
  onLayoutChange: (next: CardLayout) => void;
  cardSort: CardSortMode;
  onCardSortChange: (next: CardSortMode) => void;
  cardSize: CardSizeKey;
  onCardSizeChange: (next: CardSizeKey) => void;
  setFilter?: SetMembershipFilterState;
  syntaxFilter?: ScryfallSyntaxFilterState;
  proxyFilter?: FlagFilterMode;
  onProxyFilterChange?: (next: FlagFilterMode) => void;
  foilFilter?: FlagFilterMode;
  onFoilFilterChange?: (next: FlagFilterMode) => void;
  seekingFilter?: FlagFilterMode;
  onSeekingFilterChange?: (next: FlagFilterMode) => void;
  cardCharmsEnabled?: boolean;
  onCardCharmsEnabledChange?: (enabled: boolean) => void;
}) {
  const hasFilters =
    Boolean(setFilter) ||
    Boolean(syntaxFilter) ||
    (proxyFilter != null && onProxyFilterChange != null) ||
    (foilFilter != null && onFoilFilterChange != null) ||
    (seekingFilter != null && onSeekingFilterChange != null) ||
    onCardCharmsEnabledChange != null;
  const filtersLoading = Boolean(setFilter?.loading || syntaxFilter?.loading);
  const filtersValue = filtersMenuLabel([
    syntaxFilter?.active ? syntaxFilter.label : '',
    setFilter?.active ? setFilter.label : '',
    proxyFilter && proxyFilter !== 'all'
      ? `Proxy ${FLAG_FILTER_MODE_LABELS[proxyFilter]}`
      : '',
    foilFilter && foilFilter !== 'all' ? `Foil ${FLAG_FILTER_MODE_LABELS[foilFilter]}` : '',
    seekingFilter && seekingFilter !== 'all'
      ? `Seeking ${FLAG_FILTER_MODE_LABELS[seekingFilter]}`
      : '',
    cardCharmsEnabled === false ? 'Charms off' : '',
  ]);

  function applyNetworkFilters() {
    void Promise.all([
      setFilter ? setFilter.apply() : Promise.resolve(),
      syntaxFilter ? syntaxFilter.apply() : Promise.resolve(),
    ]);
  }

  function clearAllFilters() {
    setFilter?.clear();
    syntaxFilter?.clear();
    onProxyFilterChange?.('all');
    onFoilFilterChange?.('all');
    onSeekingFilterChange?.('all');
    onCardCharmsEnabledChange?.(true);
  }
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
      {hasFilters ? (
        <FiltersMenu
          value={filtersValue}
          loading={filtersLoading}
          ariaDetail={filtersValue !== 'All' ? filtersValue : undefined}
          onApply={applyNetworkFilters}
          onClear={clearAllFilters}
          applyLoading={filtersLoading}
        >
          {syntaxFilter ? (
            <SyntaxFilterControl
              value={syntaxFilter.queryInput}
              onChange={syntaxFilter.setQueryInput}
              onApply={applyNetworkFilters}
              error={syntaxFilter.error}
            />
          ) : null}
          {setFilter ? (
            <SetFilterMenuControl
              value={setFilter.setCodesInput}
              onChange={setFilter.setSetCodesInput}
              onApply={applyNetworkFilters}
              onClear={setFilter.clear}
              loading={setFilter.loading}
              error={setFilter.error}
              hideActions
            />
          ) : null}
          {proxyFilter != null && onProxyFilterChange ? (
            <FlagFilterRow
              label="Proxy"
              mode={proxyFilter}
              onModeChange={onProxyFilterChange}
            />
          ) : null}
          {foilFilter != null && onFoilFilterChange ? (
            <FlagFilterRow label="Foil" mode={foilFilter} onModeChange={onFoilFilterChange} />
          ) : null}
          {seekingFilter != null && onSeekingFilterChange ? (
            <FlagFilterRow
              label="Seeking"
              mode={seekingFilter}
              onModeChange={onSeekingFilterChange}
            />
          ) : null}
          {onCardCharmsEnabledChange ? (
            <label className="db-flag-filter-option">
              <input
                type="checkbox"
                checked={cardCharmsEnabled !== false}
                onChange={(e) => onCardCharmsEnabledChange(e.target.checked)}
              />
              Card hover charms
            </label>
          ) : null}
        </FiltersMenu>
      ) : null}
      <CardSizePicker size={cardSize} onChange={onCardSizeChange} />
    </div>
  );
}
