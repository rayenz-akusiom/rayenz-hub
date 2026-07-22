import {
  SWIMLANE_LABELS,
  type UnifiedWantRow,
  type WantSource,
} from '@rayenz-hub/shared';

type Props = {
  row: UnifiedWantRow;
  onClose: () => void;
  onSelectSource: (source: WantSource) => void;
};

function kindLabel(kind: WantSource['kind']): string {
  if (kind === 'seeking') return SWIMLANE_LABELS.seeking;
  if (kind === 'queued_in') return SWIMLANE_LABELS.queued_in;
  return SWIMLANE_LABELS.queued_out;
}

export function SourceInterstitial({ row, onClose, onSelectSource }: Props) {
  return (
    <div
      className="sq-interstitial"
      role="dialog"
      aria-modal="true"
      aria-label="Matching sources"
      data-testid="source-interstitial"
    >
      <div className="sq-interstitial-card">
        <header className="sq-interstitial-header">
          <h3>
            {row.displayName}
            <span className="hub-muted"> ×{row.totalQuantity}</span>
          </h3>
          <button type="button" className="hub-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <ul className="sq-interstitial-list">
          {row.sources.map((s) => (
            <li key={`${s.deckId}:${s.entryId}:${s.kind}`}>
              <button
                type="button"
                className="sq-source-chip"
                onClick={() => onSelectSource(s)}
              >
                <span className="sq-source-name">{s.cardName}</span>
                <span className="sq-source-meta">
                  {s.deckName} · {kindLabel(s.kind)}
                  {s.pairIncomplete ? ' (incomplete)' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
