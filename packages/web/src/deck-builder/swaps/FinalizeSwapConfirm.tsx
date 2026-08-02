import { createPortal } from 'react-dom';

/** Confirmation copy naming Out / In (and optional target category). */
export function finalizeSwapConfirmMessage(
  outName: string,
  inName: string,
  category?: string | null,
): string {
  const out = outName.trim() || 'Out';
  const inn = inName.trim() || 'In';
  const cat = category?.trim();
  if (cat) {
    return `Remove “${out}” from the deck and keep “${inn}” in ${cat}?`;
  }
  return `Remove “${out}” from the deck and keep “${inn}”?`;
}

export function FinalizeSwapConfirmDialog({
  outName,
  inName,
  category,
  onConfirm,
  onCancel,
  embedded = false,
}: {
  outName: string;
  inName: string;
  category?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** When true, skip outer modal backdrop (host already provides one). */
  embedded?: boolean;
}) {
  const message = finalizeSwapConfirmMessage(outName, inName, category);
  const card = (
    <div className="db-modal-card db-swap-edit-chrome" data-testid="swap-finalize-confirm">
      <h3>Finalize swap?</h3>
      <p className="db-muted">{message}</p>
      <div className="db-modal-actions">
        <button type="button" className="db-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="db-btn is-active" onClick={onConfirm}>
          Finalize
        </button>
      </div>
    </div>
  );

  if (embedded) return card;

  return createPortal(
    <div
      className="db-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm finalize swap"
    >
      {card}
    </div>,
    document.body,
  );
}
