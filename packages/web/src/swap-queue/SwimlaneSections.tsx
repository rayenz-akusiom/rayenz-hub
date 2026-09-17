import type { ReactNode } from 'react';
import {
  SWIMLANE_LABELS,
  type SwimlaneId,
} from '@rayenz-hub/shared';

export function SwimlaneSection({
  lane,
  children,
  emptyMessage,
  emptyContent,
  hasItems,
  count,
}: {
  lane: SwimlaneId;
  children: ReactNode;
  emptyMessage: string;
  emptyContent?: ReactNode;
  hasItems: boolean;
  count: number;
}) {
  return (
    <section className="sq-swimlane" data-swimlane={lane} data-testid={`swimlane-${lane}`}>
      <h2 className="sq-swimlane-title">
        {SWIMLANE_LABELS[lane]}{' '}
        <span className="db-count">({count})</span>
      </h2>
      {hasItems ? (
        children
      ) : emptyContent ? (
        emptyContent
      ) : (
        <p className="hub-muted sq-swimlane-empty">{emptyMessage}</p>
      )}
    </section>
  );
}
