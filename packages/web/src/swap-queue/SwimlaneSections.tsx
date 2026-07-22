import type { ReactNode } from 'react';
import {
  SWIMLANE_LABELS,
  type SwimlaneId,
} from '@rayenz-hub/shared';

export function SwimlaneSection({
  lane,
  children,
  emptyMessage,
  hasItems,
}: {
  lane: SwimlaneId;
  children: ReactNode;
  emptyMessage: string;
  hasItems: boolean;
}) {
  return (
    <section className="sq-swimlane" data-swimlane={lane} data-testid={`swimlane-${lane}`}>
      <h2 className="sq-swimlane-title">{SWIMLANE_LABELS[lane]}</h2>
      {hasItems ? children : <p className="hub-muted sq-swimlane-empty">{emptyMessage}</p>}
    </section>
  );
}
