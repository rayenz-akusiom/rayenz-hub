import { DbMenu, DbMenuItem } from './DbMenu';

/** Session browse filter for a boolean card flag (proxy / foil). */
export type FlagFilterMode = 'all' | 'hide' | 'only';

export const FLAG_FILTER_MODE_LABELS: Record<FlagFilterMode, string> = {
  all: 'All',
  hide: 'Hide',
  only: 'Only',
};

const FLAG_FILTER_MODES: FlagFilterMode[] = ['all', 'hide', 'only'];

/** Whether a card's flag value passes the current filter mode. */
export function cardMatchesFlagFilter(flag: boolean, mode: FlagFilterMode): boolean {
  if (mode === 'all') return true;
  if (mode === 'hide') return !flag;
  return flag;
}

export function FlagFilterMenu({
  label,
  mode,
  onModeChange,
}: {
  label: string;
  mode: FlagFilterMode;
  onModeChange: (next: FlagFilterMode) => void;
}) {
  return (
    <DbMenu
      label={label}
      value={FLAG_FILTER_MODE_LABELS[mode]}
      ariaLabel={`${label} filter`}
    >
      {FLAG_FILTER_MODES.map((m) => (
        <DbMenuItem key={m} active={mode === m} onSelect={() => onModeChange(m)}>
          {FLAG_FILTER_MODE_LABELS[m]}
        </DbMenuItem>
      ))}
    </DbMenu>
  );
}
