export type DeckSyncStatus = 'syncing' | 'synced' | 'local' | 'error';

const LABELS: Record<DeckSyncStatus, string> = {
  syncing: 'Saving to Hub…',
  synced: 'Synced to Hub',
  local: 'Saved locally only',
  error: 'Hub sync failed',
};

function CloudIcon({ status }: { status: DeckSyncStatus }) {
  return (
    <svg
      className="db-sync-charm-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12.4 7.1A3.2 3.2 0 0 0 6.3 5.6 2.7 2.7 0 0 0 3 8.3c0 .1 0 .2.01.3A2.5 2.5 0 0 0 3.2 13h9.1A2.7 2.7 0 0 0 12.4 7.1z"
        opacity={status === 'local' || status === 'error' ? 0.55 : 1}
      />
      {status === 'synced' ? (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.4 9.1 7.1 10.8 10.6 7"
        />
      ) : null}
      {status === 'syncing' ? (
        <circle
          className="db-sync-charm-spin"
          cx="8"
          cy="9.2"
          r="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="8 6"
          strokeLinecap="round"
        />
      ) : null}
      {status === 'local' ? (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          d="M5.2 6.2 10.8 11.8M10.8 6.2 5.2 11.8"
        />
      ) : null}
      {status === 'error' ? (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          d="M8 6.4v3.2M8 11.4h.01"
        />
      ) : null}
    </svg>
  );
}

export function SyncStatusCharm({ status }: { status: DeckSyncStatus }) {
  const label = LABELS[status];
  return (
    <span
      className={`db-sync-charm is-${status}`}
      role="img"
      aria-label={label}
    >
      <CloudIcon status={status} />
    </span>
  );
}
