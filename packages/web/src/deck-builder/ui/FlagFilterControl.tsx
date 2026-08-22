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

/** All/Hide/Only radios for the merged Filters panel. */
export function FlagFilterRow({
  label,
  mode,
  onModeChange,
}: {
  label: string;
  mode: FlagFilterMode;
  onModeChange: (next: FlagFilterMode) => void;
}) {
  const name = `flag-filter-${label.toLowerCase()}`;
  return (
    <fieldset className="db-flag-filter" aria-label={`${label} filter`}>
      <legend>{label}</legend>
      {FLAG_FILTER_MODES.map((m) => (
        <label key={m} className="db-flag-filter-option">
          <input
            type="radio"
            name={name}
            checked={mode === m}
            onChange={() => onModeChange(m)}
          />
          {FLAG_FILTER_MODE_LABELS[m]}
        </label>
      ))}
    </fieldset>
  );
}
