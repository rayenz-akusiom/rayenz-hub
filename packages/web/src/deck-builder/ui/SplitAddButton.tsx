import { DbMenu, DbMenuItem } from './DbMenu';

export type CommanderAddVariant = 'pendragon' | 'import-commander' | 'import-pendragon';

/** Primary add plus caret for alternate formats / import. */
export function SplitAddButton({
  addLabel,
  disabled,
  disabledTitle,
  onAdd,
  onAddVariant,
}: {
  addLabel: string;
  disabled?: boolean;
  disabledTitle?: string;
  onAdd: () => void;
  onAddVariant?: (kind: CommanderAddVariant) => void;
}) {
  return (
    <div className="db-split-add">
      <button
        type="button"
        className={`db-btn${disabled ? '' : ' is-active'}`}
        onClick={onAdd}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
      >
        {addLabel}
      </button>
      {onAddVariant ? (
        <DbMenu
          ariaLabel="Add a different format deck"
          align="end"
          triggerClassName={`db-btn db-split-add-caret${disabled ? '' : ' is-active'}`}
          icon={<span aria-hidden="true">▾</span>}
        >
          <DbMenuItem disabled={disabled} onSelect={() => onAddVariant('pendragon')}>
            Pendragon deck
          </DbMenuItem>
          <DbMenuItem disabled={disabled} onSelect={() => onAddVariant('import-commander')}>
            Import Commander…
          </DbMenuItem>
          <DbMenuItem disabled={disabled} onSelect={() => onAddVariant('import-pendragon')}>
            Import Pendragon…
          </DbMenuItem>
        </DbMenu>
      ) : null}
    </div>
  );
}
