import { useCallback, useRef, useState } from 'react';
import {
  fetchInSetMembership,
  normalizeSetCodes,
  normalizeSetCodesKey,
} from '@rayenz-hub/shared';
import { DbMenu } from './DbMenu';

export function setFilterLabel(appliedCodes: string[], excludeCodes: string[] = []): string {
  const parts: string[] = [];
  if (appliedCodes.length) {
    parts.push(
      appliedCodes.length <= 3 ? appliedCodes.join(',') : `${appliedCodes.length} sets`,
    );
  }
  if (excludeCodes.length) {
    parts.push(
      `−${excludeCodes.length <= 2 ? excludeCodes.join(',') : `${excludeCodes.length}`}`,
    );
  }
  return parts.length ? parts.join(' ') : 'All';
}

export type SetMembershipFilterState = {
  setCodesInput: string;
  setSetCodesInput: (next: string) => void;
  appliedCodes: string[];
  membership: ReadonlySet<string> | null;
  excludeCodesInput: string;
  setExcludeCodesInput: (next: string) => void;
  appliedExcludeCodes: string[];
  excludeMembership: ReadonlySet<string> | null;
  loading: boolean;
  error: string;
  apply: (input?: string, excludeInput?: string) => Promise<void>;
  clear: () => void;
  label: string;
  active: boolean;
};

/** Session-only Scryfall `in:` / `set:` membership filter state (include + optional exclude). */
export function useSetMembershipFilter(): SetMembershipFilterState {
  const [setCodesInput, setSetCodesInput] = useState('');
  const [appliedCodes, setAppliedCodes] = useState<string[]>([]);
  const [membership, setMembership] = useState<ReadonlySet<string> | null>(null);
  const [excludeCodesInput, setExcludeCodesInput] = useState('');
  const [appliedExcludeCodes, setAppliedExcludeCodes] = useState<string[]>([]);
  const [excludeMembership, setExcludeMembership] = useState<ReadonlySet<string> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    setSetCodesInput('');
    setAppliedCodes([]);
    setMembership(null);
    setExcludeCodesInput('');
    setAppliedExcludeCodes([]);
    setExcludeMembership(null);
    setLoading(false);
    setError('');
  }, []);

  const apply = useCallback(
    async (input?: string, excludeInput?: string) => {
      const includeRaw = input != null ? input : setCodesInput;
      const excludeRaw = excludeInput != null ? excludeInput : excludeCodesInput;
      const includeCodes = normalizeSetCodes(includeRaw);
      const excludeCodes = normalizeSetCodes(excludeRaw);
      if (!includeCodes.length && !excludeCodes.length) {
        clear();
        return;
      }
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError('');
      setSetCodesInput(includeCodes.join(','));
      setExcludeCodesInput(excludeCodes.join(','));
      try {
        const [includeNames, excludeNames] = await Promise.all([
          includeCodes.length ? fetchInSetMembership(includeCodes) : Promise.resolve(null),
          excludeCodes.length ? fetchInSetMembership(excludeCodes) : Promise.resolve(null),
        ]);
        if (requestId !== requestIdRef.current) return;
        setAppliedCodes(includeCodes);
        setMembership(includeNames);
        setAppliedExcludeCodes(excludeCodes);
        setExcludeMembership(excludeNames);
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        setAppliedCodes([]);
        setMembership(null);
        setAppliedExcludeCodes([]);
        setExcludeMembership(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [clear, excludeCodesInput, setCodesInput],
  );

  const includeActive = appliedCodes.length > 0 && membership != null;
  const excludeActive = appliedExcludeCodes.length > 0 && excludeMembership != null;

  return {
    setCodesInput,
    setSetCodesInput,
    appliedCodes,
    membership,
    excludeCodesInput,
    setExcludeCodesInput,
    appliedExcludeCodes,
    excludeMembership,
    loading,
    error,
    apply,
    clear,
    label: setFilterLabel(appliedCodes, appliedExcludeCodes),
    active: includeActive || excludeActive,
  };
}

export function SetFilterMenuControl({
  value,
  onChange,
  onApply,
  onClear,
  loading,
  error,
  excludeValue,
  onExcludeChange,
  showExclude = false,
  hideActions = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onApply: () => void;
  onClear: () => void;
  loading?: boolean;
  error?: string;
  excludeValue?: string;
  onExcludeChange?: (next: string) => void;
  /** When true, show exclude codes field (Swap Queue shopping). */
  showExclude?: boolean;
  /** When true, omit Apply/Clear (parent Filters menu owns them). */
  hideActions?: boolean;
}) {
  return (
    <div
      className="db-set-filter"
      role="none"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <label className="db-set-filter-label">
        {showExclude ? 'Include sets' : 'Set codes'}
        <input
          type="text"
          value={value}
          placeholder="mh3, msc"
          aria-label={showExclude ? 'Include set codes' : 'Set codes'}
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
      <p className="db-set-filter-hint">
        {showExclude
          ? 'Match any of these sets (Scryfall in:/set:)'
          : 'Scryfall in:/set: — appears in or printed in set'}
      </p>
      {showExclude ? (
        <>
          <label className="db-set-filter-label">
            Exclude sets
            <input
              type="text"
              value={excludeValue || ''}
              placeholder="lea, leb"
              aria-label="Exclude set codes"
              spellCheck={false}
              autoCapitalize="characters"
              onChange={(e) => onExcludeChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onApply();
                }
              }}
            />
          </label>
          <p className="db-set-filter-hint">Hide cards that appear in these sets</p>
        </>
      ) : null}
      {hideActions ? null : (
        <div className="db-set-filter-actions">
          <button type="button" className="db-btn" disabled={loading} onClick={onApply}>
            {loading ? 'Loading…' : 'Apply'}
          </button>
          <button type="button" className="db-btn" disabled={loading} onClick={onClear}>
            Clear
          </button>
        </div>
      )}
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
  showExclude = false,
}: {
  filter: SetMembershipFilterState;
  showExclude?: boolean;
}) {
  const ariaParts: string[] = [];
  if (filter.appliedCodes.length) {
    ariaParts.push(normalizeSetCodesKey(filter.appliedCodes));
  }
  if (filter.appliedExcludeCodes.length) {
    ariaParts.push(`exclude ${normalizeSetCodesKey(filter.appliedExcludeCodes)}`);
  }
  return (
    <DbMenu
      label="Set"
      value={filter.loading ? '…' : filter.label}
      ariaLabel={`Set filter${ariaParts.length ? `: ${ariaParts.join('; ')}` : ''}`}
    >
      <SetFilterMenuControl
        value={filter.setCodesInput}
        onChange={filter.setSetCodesInput}
        excludeValue={filter.excludeCodesInput}
        onExcludeChange={filter.setExcludeCodesInput}
        showExclude={showExclude}
        onApply={() => void filter.apply()}
        onClear={filter.clear}
        loading={filter.loading}
        error={filter.error}
      />
    </DbMenu>
  );
}
