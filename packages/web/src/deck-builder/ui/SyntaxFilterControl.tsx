import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchSyntaxMembership,
  syntaxScopeKey,
  type SyntaxMembershipCard,
} from '@rayenz-hub/shared';

export function syntaxFilterLabel(appliedQuery: string, max = 24): string {
  const q = appliedQuery.trim();
  if (!q) return '';
  return q.length <= max ? q : `${q.slice(0, max - 1)}…`;
}

export type ScryfallSyntaxFilterState = {
  queryInput: string;
  setQueryInput: (next: string) => void;
  appliedQuery: string;
  membership: ReadonlySet<string> | null;
  loading: boolean;
  error: string;
  apply: (input?: string) => Promise<void>;
  clear: () => void;
  label: string;
  active: boolean;
};

/**
 * Session-only collection-scoped Scryfall syntax filter.
 * Re-queries when {@link syntaxScopeKey} changes while a query is applied.
 */
export function useScryfallSyntaxFilter(
  cards: SyntaxMembershipCard[],
): ScryfallSyntaxFilterState {
  const [queryInput, setQueryInput] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [membership, setMembership] = useState<ReadonlySet<string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const queryInputRef = useRef(queryInput);
  queryInputRef.current = queryInput;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const cardsKey = syntaxScopeKey(cards);
  const appliedQueryRef = useRef(appliedQuery);
  appliedQueryRef.current = appliedQuery;

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setQueryInput('');
    setAppliedQuery('');
    setMembership(null);
    setLoading(false);
    setError('');
  }, []);

  const apply = useCallback(
    async (input?: string) => {
      const q = String(input != null ? input : queryInputRef.current).trim();
      if (!q) {
        clear();
        return;
      }
      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setError('');
      setQueryInput(q);
      try {
        const names = await fetchSyntaxMembership(q, cardsRef.current, {
          signal: ac.signal,
        });
        if (requestId !== requestIdRef.current) return;
        setAppliedQuery(q);
        setMembership(names);
      } catch (e) {
        if (ac.signal.aborted || requestId !== requestIdRef.current) return;
        setAppliedQuery('');
        setMembership(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [clear],
  );

  useEffect(() => {
    if (!appliedQueryRef.current) return;
    void apply(appliedQueryRef.current);
  }, [apply, cardsKey]);

  return {
    queryInput,
    setQueryInput,
    appliedQuery,
    membership,
    loading,
    error,
    apply,
    clear,
    label: syntaxFilterLabel(appliedQuery),
    active: Boolean(appliedQuery) && membership != null,
  };
}

export function SyntaxFilterControl({
  value,
  onChange,
  onApply,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  onApply: () => void;
  error?: string;
}) {
  return (
    <div className="db-syntax-filter" role="none">
      <label className="db-set-filter-label">
        Scryfall syntax
        <input
          type="text"
          value={value}
          placeholder='t:instant o:"draw a card"'
          aria-label="Scryfall syntax"
          spellCheck={false}
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
        Search this list with Scryfall syntax (oracle-level; use Proxy/Foil for deck flags)
      </p>
      {error ? (
        <p className="db-set-filter-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
