import { useMemo } from 'react';
import type { Suggestion } from '@rayenz-hub/shared';
import type { ReviewProgress } from '../lib/hub-storage';

export function BudgetSpendTally({
  budgetUsd,
  suggestions,
  progress,
}: {
  budgetUsd: number;
  suggestions: Suggestion[];
  progress: ReviewProgress;
}) {
  const spentUsd = useMemo(() => {
    let total = 0;
    const byId = new Map(suggestions.map((s) => [String(s.suggestion_id), s]));
    Object.entries(progress.decisions || {}).forEach(([id, decision]) => {
      if (!decision || decision.status !== 'accepted') return;
      const suggestion = byId.get(id);
      const usd = (suggestion as { incomingUsd?: number } | undefined)?.incomingUsd;
      if (usd != null && Number.isFinite(usd)) {
        total += usd;
      }
    });
    return total;
  }, [suggestions, progress]);

  const overBudget = spentUsd > budgetUsd;

  return (
    <div className={'ds-budget-tally' + (overBudget ? ' ds-budget-tally-over' : '')}>
      <p className="ds-budget-tally-main">
        Accepted ${spentUsd.toFixed(2)} of ${budgetUsd.toFixed(2)} target
      </p>
      {overBudget ? (
        <p className="ds-budget-tally-warn" role="status">
          Accepted swaps exceed the upgrade budget target.
        </p>
      ) : null}
    </div>
  );
}
