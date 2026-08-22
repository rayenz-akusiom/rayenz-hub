export type ActiveFilterChip = {
  id: string;
  label: string;
  onDismiss: () => void;
};

/** Dismissible chips for Filters that are not “All”. */
export function ActiveFilterChips({
  chips,
  onClearAll,
}: {
  chips: ActiveFilterChip[];
  onClearAll?: () => void;
}) {
  if (!chips.length) return null;
  return (
    <div className="db-filter-chips" role="group" aria-label="Active filters">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="db-filter-chip"
          onClick={chip.onDismiss}
          aria-label={`Remove filter: ${chip.label}`}
        >
          <span>{chip.label}</span>
          <span className="db-filter-chip-x" aria-hidden="true">
            ×
          </span>
        </button>
      ))}
      {onClearAll && chips.length > 1 ? (
        <button type="button" className="db-filter-chip db-filter-chip-clear" onClick={onClearAll}>
          Clear all
        </button>
      ) : null}
    </div>
  );
}
