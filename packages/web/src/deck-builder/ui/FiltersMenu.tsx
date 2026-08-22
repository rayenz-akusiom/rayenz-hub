import type { ReactNode } from 'react';
import { DbMenu } from './DbMenu';

export function filtersMenuLabel(parts: Array<string | null | undefined>): string {
  const filtered = parts.map((p) => String(p || '').trim()).filter(Boolean);
  return filtered.length ? filtered.join(' · ') : 'All';
}

/** Combined Filters dropdown; stays open while editing (stopPropagation). */
export function FiltersMenu({
  value,
  loading,
  ariaDetail,
  onApply,
  onClear,
  applyLoading,
  children,
}: {
  value: string;
  loading?: boolean;
  ariaDetail?: string;
  onApply: () => void;
  onClear: () => void;
  applyLoading?: boolean;
  children: ReactNode;
}) {
  const busy = Boolean(applyLoading || loading);
  return (
    <DbMenu
      label="Filters"
      value={loading ? '…' : value}
      ariaLabel={ariaDetail ? `Filters: ${ariaDetail}` : 'Filters'}
    >
      <div
        className="db-filters"
        role="none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {children}
        <div className="db-filters-actions">
          <button type="button" className="db-btn" disabled={busy} onClick={onApply}>
            {busy ? 'Loading…' : 'Apply'}
          </button>
          <button type="button" className="db-btn" disabled={busy} onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
    </DbMenu>
  );
}
