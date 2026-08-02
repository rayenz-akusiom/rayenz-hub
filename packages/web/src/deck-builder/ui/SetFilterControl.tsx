import { useCallback, useRef, useState } from 'react';
import {
  fetchInSetMembership,
  normalizeSetCodes,
  normalizeSetCodesKey,
} from '@rayenz-hub/shared';
import { DbMenu } from './DbMenu';

export function setFilterLabel(appliedCodes: string[]): string {
  if (!appliedCodes.length) return 'All';
  if (appliedCodes.length <= 3) return appliedCodes.join(',');
  return `${appliedCodes.length} sets`;
}

export type SetMembershipFilterState = {
  setCodesInput: string;
  setSetCodesInput: (next: string) => void;
  appliedCodes: string[];
  membership: ReadonlySet<string> | null;
  loading: boolean;
  error: string;
  apply: (input?: string) => Promise<void>;
  clear: () => void;
  label: string;
  active: boolean;
};

/** Session-only Scryfall `in:` / `set:` membership filter state. */
export function useSetMembershipFilter(): SetMembershipFilterState {
  const [setCodesInput, setSetCodesInput] = useState('');
  const [appliedCodes, setAppliedCodes] = useState<string[]>([]);
  const [membership, setMembership] = useState<ReadonlySet<string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    setSetCodesInput('');
    setAppliedCodes([]);
    setMembership(null);
    setLoading(false);
    setError('');
  }, []);

  const apply = useCallback(async (input?: string) => {
    const raw = input != null ? input : setCodesInput;
    const codes = normalizeSetCodes(raw);
    if (!codes.length) {
      clear();
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    setSetCodesInput(codes.join(','));
    try {
      const names = await fetchInSetMembership(codes);
      if (requestId !== requestIdRef.current) return;
      setAppliedCodes(codes);
      setMembership(names);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setAppliedCodes([]);
      setMembership(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [clear, setCodesInput]);

  return {
    setCodesInput,
    setSetCodesInput,
    appliedCodes,
    membership,
    loading,
    error,
    apply,
    clear,
    label: setFilterLabel(appliedCodes),
    active: appliedCodes.length > 0 && membership != null,
  };
}

export function SetFilterMenuControl({
  value,
  onChange,
  onApply,
  onClear,
  loading,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  onApply: () => void;
  onClear: () => void;
  loading?: boolean;
  error?: string;
}) {
  return (
    <div
      className="db-set-filter"
      role="none"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <label className="db-set-filter-label">
        Set codes
        <input
          type="text"
          value={value}
          placeholder="mh3, msc"
          aria-label="Set codes"
          spellCheck={false}
          autoCapitalize="characters"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onApply();
            }
          }}
        />
      </label>
      <p className="db-set-filter-hint">Scryfall in:/set: — appears in or printed in set</p>
      <div className="db-set-filter-actions">
        <button type="button" className="db-btn" disabled={loading} onClick={onApply}>
          {loading ? 'Loading…' : 'Apply'}
        </button>
        <button type="button" className="db-btn" disabled={loading} onClick={onClear}>
          Clear
        </button>
      </div>
      {error ? (
        <p className="db-set-filter-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Toolbar Set filter menu wired to {@link useSetMembershipFilter}. */
export function SetFilterMenu({
  filter,
}: {
  filter: SetMembershipFilterState;
}) {
  return (
    <DbMenu
      label="Set"
      value={filter.loading ? '…' : filter.label}
      ariaLabel={`Set filter${filter.active ? `: ${normalizeSetCodesKey(filter.appliedCodes)}` : ''}`}
    >
      <SetFilterMenuControl
        value={filter.setCodesInput}
        onChange={filter.setSetCodesInput}
        onApply={() => void filter.apply()}
        onClear={filter.clear}
        loading={filter.loading}
        error={filter.error}
      />
    </DbMenu>
  );
}
