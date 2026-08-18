import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  countSwapGlanceItems,
  selectSwapGlanceItems,
  type SwapGlanceMode,
  type WantSource,
} from '@rayenz-hub/shared';
import { isApiConfigured } from '../api/hub-api';
import { OWNER_ONLY_EXPENSIVE_MESSAGE, useIsHubOwner } from '../lib/hub-auth-session';
import { copyPngBlob, downloadPngBlob } from '../lib/glance-png';
import {
  formatGlanceStatusLine,
  GlanceModalActions,
  GlancePreviewSlot,
  GlanceStatusLine,
} from '../lib/glance-ui';
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
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [pngBlobs, setPngBlobs] = useState<Blob[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const apiReady = isApiConfigured();
  const ownerReady = useIsHubOwner();
  const itemCount = useMemo(
    () => countSwapGlanceItems(sources, { mode, includeSeeking }),
    [sources, mode, includeSeeking],
  );

  const resetPreview = useCallback(() => {
    for (const url of previewUrls) URL.revokeObjectURL(url);
    setPreviewUrls([]);
    setPngBlobs([]);
    setPageIndex(0);
    setStatusLine(null);
  }, [previewUrls]);

  const close = useCallback(() => {
    setError(null);
    setLoading(false);
    resetPreview();
    onClose();
  }, [onClose, resetPreview]);

  const generate = useCallback(async () => {
    if (!apiReady || !ownerReady) {
      setError(
        ownerReady
          ? 'Hub API is required to generate a swaps glance image. Sign in from the left nav.'
          : `${OWNER_ONLY_EXPENSIVE_MESSAGE}.`,
      );
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
      const urls = result.blobs.map((b) => URL.createObjectURL(b));
      setPngBlobs(result.blobs);
      setPreviewUrls(urls);
      setPageIndex(0);
      setStatusLine(
        formatGlanceStatusLine({
          pageCount: result.pageCount,
          generation: result.generation,
          cache: result.cache,
          delivery: result.delivery,
          omittedCardCount: result.omittedCardCount,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate swaps glance image.');
    } finally {
      setLoading(false);
    }
  }, [apiReady, ownerReady, includeSeeking, itemCount, mode, resetPreview, setCodes, sources]);

  const pageCount = pngBlobs.length;
  const currentBlob = pngBlobs[pageIndex] ?? null;
  const currentUrl = previewUrls[pageIndex] ?? null;

  useEffect(() => {
    if (pageIndex >= pageCount && pageCount > 0) {
      setPageIndex(pageCount - 1);
    }
  }, [pageCount, pageIndex]);

  const onDownload = useCallback(() => {
    if (!currentBlob) return;
    const name =
      pageCount > 1
        ? `swaps-at-a-glance-${pageIndex + 1}.png`
        : 'swaps-at-a-glance.png';
    downloadPngBlob(currentBlob, name);
  }, [currentBlob, pageCount, pageIndex]);

  const onDownloadAll = useCallback(() => {
    if (pngBlobs.length <= 1) return;
    pngBlobs.forEach((blob, i) => {
      downloadPngBlob(blob, `swaps-at-a-glance-${i + 1}.png`);
    });
  }, [pngBlobs]);

  const onCopy = useCallback(async () => {
    if (!currentBlob) return;
    await copyPngBlob(currentBlob);
  }, [currentBlob]);

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
        <div className="db-glance-chrome">
          <div className="sq-glance-options">
            <fieldset className="db-glance-mode">
              <legend>Show</legend>
              <label className="db-glance-option">
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
              <label className="db-glance-option">
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
            <label className="db-glance-option">
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
          <div className="db-glance-primary-actions">
            <button
              type="button"
              className="db-btn"
              disabled={loading || itemCount === 0 || !apiReady || !ownerReady}
              title={
                !apiReady
                  ? 'Sign in from the left nav to generate glance images'
                  : !ownerReady
                    ? OWNER_ONLY_EXPENSIVE_MESSAGE
                    : undefined
              }
              onClick={() => void generate()}
            >
              {currentBlob ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>
        <GlanceStatusLine
          loading={loading}
          loadingText="Generating swaps glance image…"
          error={error}
          statusLine={statusLine}
        />
        <GlancePreviewSlot
          previewUrl={currentUrl}
          alt={
            pageCount > 1
              ? `Swaps at a glance preview ${pageIndex + 1} of ${pageCount}`
              : 'Swaps at a glance preview'
          }
          loading={loading}
        />
        {pageCount > 1 ? (
          <div className="sq-glance-carousel" role="group" aria-label="Glance pages">
            <button
              type="button"
              className="db-btn"
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </button>
            <span className="hub-muted" aria-live="polite">
              {pageIndex + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="db-btn"
              disabled={pageIndex >= pageCount - 1}
              onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
            >
              Next
            </button>
          </div>
        ) : null}
        <GlanceModalActions
          onClose={close}
          onDownload={onDownload}
          onCopy={onCopy}
          downloadDisabled={!currentBlob}
          afterDownload={
            pageCount > 1 ? (
              <button
                type="button"
                className="db-btn"
                disabled={!pngBlobs.length}
                onClick={onDownloadAll}
              >
                Download all
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}
