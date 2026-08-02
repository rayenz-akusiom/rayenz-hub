import { useCallback, useMemo, useState } from 'react';
import {
  countSwapGlanceItems,
  selectSwapGlanceItems,
  type SwapGlanceMode,
  type WantSource,
} from '@rayenz-hub/shared';
import { isApiConfigured } from '../api/hub-api';
import { apiPostSwapsGlance } from './swaps-glance-api';

type Props = {
  open: boolean;
  sources: WantSource[];
  /** Active Scryfall set-filter codes (shown on the PNG footer). */
  setCodes?: string[];
  onClose: () => void;
};

export function SwapsGlanceDialog({ open, sources, setCodes = [], onClose }: Props) {
  const [mode, setMode] = useState<SwapGlanceMode>('in_only');
  const [includeSeeking, setIncludeSeeking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const apiReady = isApiConfigured();
  const itemCount = useMemo(
    () => countSwapGlanceItems(sources, { mode, includeSeeking }),
    [sources, mode, includeSeeking],
  );

  const resetPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPngBlob(null);
    setStatusLine(null);
  }, [previewUrl]);

  const close = useCallback(() => {
    setError(null);
    setLoading(false);
    resetPreview();
    onClose();
  }, [onClose, resetPreview]);

  const generate = useCallback(async () => {
    if (!apiReady) {
      setError('Hub API is required to generate a swaps glance image. Configure API URL and key in settings.');
      return;
    }
    if (itemCount === 0) {
      setError('No swaps match the current filters and options.');
      return;
    }
    setLoading(true);
    setError(null);
    resetPreview();
    try {
      const items = selectSwapGlanceItems(sources, { mode, includeSeeking });
      const result = await apiPostSwapsGlance({
        mode,
        includeSeeking,
        setCodes: setCodes.length ? setCodes : undefined,
        items,
      });
      const url = URL.createObjectURL(result.blob);
      setPngBlob(result.blob);
      setPreviewUrl(url);
      const parts = ['Generated'];
      if (result.generation) parts.push(`gen ${result.generation}`);
      if (result.cache) parts.push(`cache ${result.cache}`);
      if (result.delivery === 'presigned') parts.push('presigned fetch');
      setStatusLine(parts.join(' · '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate swaps glance image.');
    } finally {
      setLoading(false);
    }
  }, [apiReady, includeSeeking, itemCount, mode, resetPreview, setCodes, sources]);

  const onDownload = useCallback(() => {
    if (!pngBlob) return;
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(pngBlob);
    anchor.download = 'swaps-at-a-glance.png';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }, [pngBlob]);

  const onCopy = useCallback(async () => {
    if (!pngBlob || !navigator.clipboard?.write) return;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
  }, [pngBlob]);

  const canCopy =
    typeof ClipboardItem !== 'undefined' &&
    Boolean(navigator.clipboard?.write) &&
    Boolean(pngBlob);

  if (!open) return null;

  return (
    <div
      className="db-modal db-glance-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Swaps at a glance"
    >
      <div className="db-modal-card db-modal-wide db-glance-modal">
        <h2>Swaps at a glance</h2>
        <div className="sq-glance-options">
          <fieldset className="sq-glance-mode">
            <legend>Show</legend>
            <label className="sq-glance-option">
              <input
                type="radio"
                name="sq-glance-mode"
                checked={mode === 'in_only'}
                onChange={() => {
                  setMode('in_only');
                  resetPreview();
                }}
              />
              Looking for (In)
            </label>
            <label className="sq-glance-option">
              <input
                type="radio"
                name="sq-glance-mode"
                checked={mode === 'full'}
                onChange={() => {
                  setMode('full');
                  resetPreview();
                }}
              />
              Full swaps (Out → In)
            </label>
          </fieldset>
          <label className="sq-glance-option">
            <input
              type="checkbox"
              checked={includeSeeking}
              onChange={(e) => {
                setIncludeSeeking(e.target.checked);
                resetPreview();
              }}
            />
            Include Seeking
          </label>
          <p className="hub-muted sq-glance-count" role="status">
            {itemCount === 0
              ? 'No rows for current filters and options.'
              : `${itemCount} row${itemCount === 1 ? '' : 's'} from current filters.`}
          </p>
        </div>
        <div className="db-glance-statusline">
          {loading ? <p>Generating swaps glance image…</p> : null}
          {error ? <p className="db-error">{error}</p> : null}
          {!loading && !error && statusLine ? (
            <p className="db-glance-status">{statusLine}</p>
          ) : null}
        </div>
        <div className="db-glance-slot">
          {previewUrl ? (
            <img src={previewUrl} alt="Swaps at a glance preview" className="db-glance-preview" />
          ) : (
            <div className="db-glance-skeleton" aria-hidden="true">
              {loading ? <span className="db-glance-spinner" /> : null}
            </div>
          )}
        </div>
        <div className="db-modal-actions">
          <button type="button" className="db-btn" onClick={close}>
            Close
          </button>
          <button
            type="button"
            className="db-btn"
            disabled={loading || itemCount === 0 || !apiReady}
            title={!apiReady ? 'Configure Hub API to generate glance images' : undefined}
            onClick={() => void generate()}
          >
            Generate
          </button>
          <button type="button" className="db-btn" disabled={!pngBlob} onClick={onDownload}>
            Download
          </button>
          <button type="button" className="db-btn" disabled={!canCopy} onClick={() => void onCopy()}>
            Copy image
          </button>
        </div>
      </div>
    </div>
  );
}
