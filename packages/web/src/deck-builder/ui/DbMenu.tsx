import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Compact dropdown: titled trigger showing current value, or icon-only (e.g. hamburger). */
export function DbMenu({
  label,
  value,
  icon,
  ariaLabel,
  triggerClassName = 'db-btn',
  align = 'start',
  children,
}: {
  /** Section title on the trigger (e.g. "Browse"). */
  label?: string;
  /** Current selection text next to the title. */
  value?: string;
  /** Icon-only trigger content (hamburger, etc.). */
  icon?: ReactNode;
  ariaLabel?: string;
  triggerClassName?: string;
  align?: 'start' | 'end';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isIconOnly = Boolean(icon) && label == null;

  return (
    <div className={`db-menu${align === 'end' ? ' is-align-end' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`${triggerClassName}${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel || (isIconOnly ? 'Menu' : undefined)}
        onClick={() => setOpen((v) => !v)}
      >
        {isIconOnly ? (
          icon
        ) : (
          <span className="db-menu-trigger-inner">
            {label ? <span className="db-menu-label">{label}</span> : null}
            {value ? <span className="db-menu-value">{value}</span> : null}
            <span className="db-menu-caret" aria-hidden="true">
              ▾
            </span>
          </span>
        )}
      </button>
      {open ? (
        <div
          id={menuId}
          className="db-menu-panel"
          role="menu"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function DbMenuItem({
  children,
  active,
  disabled,
  onSelect,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`db-menu-item${active ? ' is-active' : ''}`}
      disabled={disabled}
      onClick={() => onSelect?.()}
    >
      {children}
    </button>
  );
}
