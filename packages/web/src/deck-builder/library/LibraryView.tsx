import type { DeckSummary } from '@rayenz-hub/shared';

export function LibraryView({
  decks,
  loading,
  error,
  onOpen,
  onAdd,
  onDelete,
  onRefreshRemote,
}: {
  decks: DeckSummary[];
  loading?: boolean;
  error?: string | null;
  onOpen: (deckId: string) => void;
  onAdd: () => void;
  onDelete: (deckId: string) => void;
  onRefreshRemote?: () => void;
}) {
  return (
    <div className="db-library">
      <header className="db-header">
        <h2>Deck Builder</h2>
        <div className="db-header-actions">
          {onRefreshRemote ? (
            <button type="button" className="db-btn" onClick={onRefreshRemote}>
              Sync from API
            </button>
          ) : null}
          <button type="button" className="db-btn is-active" onClick={onAdd}>
            Add deck
          </button>
        </div>
      </header>
      {error ? <p className="db-error">{error}</p> : null}
      {loading ? <p className="db-meta">Loading…</p> : null}
      {!loading && !decks.length ? (
        <div className="db-empty-state">
          <p>No Hub-saved decks yet.</p>
          <p>Add a deck by pasting an Archidekt import, or refresh from Archidekt when the bridge is available.</p>
          <button type="button" className="db-btn is-active" onClick={onAdd}>
            Add deck
          </button>
        </div>
      ) : (
        <ul className="db-library-list">
          {decks.map((d) => (
            <li key={d.deckId} className="db-library-row">
              <button type="button" className="db-library-item" onClick={() => onOpen(d.deckId)}>
                <span className="db-library-name">{d.name}</span>
                <span className="db-meta">
                  {d.format} · updated {new Date(d.updatedAt).toLocaleString()}
                </span>
              </button>
              <button
                type="button"
                className="db-btn db-btn-danger"
                aria-label={`Delete ${d.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Remove "${d.name}" from Hub library?`)) {
                    onDelete(d.deckId);
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
