import type { ReactNode } from 'react';
import { canCopyPng } from './glance-png';

export type GlanceStatusParts = {
  generation?: string | null;
  cache?: string | null;
  delivery?: string | null;
  pageCount?: number;
  omittedCardCount?: number;
};

function humanCache(cache: string): string | null {
  const key = cache.trim().toUpperCase();
  if (key === 'HIT') return 'served from cache';
  if (key === 'MISS') return 'freshly rendered';
  if (key === 'PARTIAL') return 'partly from cache';
  return null;
}

function humanDelivery(delivery: string): string | null {
  if (delivery === 'presigned') return 'downloaded';
  if (delivery === 'bundle') return 'bundled images';
  return null;
}

/** Shared status-line text after a successful glance generate. */
export function formatGlanceStatusLine(parts: GlanceStatusParts): string {
  const out = ['Ready'];
  if (parts.pageCount != null && parts.pageCount > 1) {
    out.push(`${parts.pageCount} images`);
  }
  const cache = parts.cache ? humanCache(parts.cache) : null;
  if (cache) out.push(cache);
  const delivery = parts.delivery ? humanDelivery(parts.delivery) : null;
  if (delivery) out.push(delivery);
  if (parts.omittedCardCount != null && parts.omittedCardCount > 0) {
    out.push(`${parts.omittedCardCount} cards left off`);
  }
  return out.join(' · ');
}

/** Jargon for tooltips: gen / cache / delivery. */
export function formatGlanceStatusTooltip(parts: GlanceStatusParts): string | undefined {
  const jargon: string[] = [];
  if (parts.generation) jargon.push(`gen ${parts.generation}`);
  if (parts.cache) jargon.push(`cache ${parts.cache}`);
  if (parts.delivery && parts.delivery !== 'inline') jargon.push(parts.delivery);
  return jargon.length ? jargon.join(' · ') : undefined;
}

type PreviewSlotProps = {
  previewUrl: string | null;
  alt: string;
  loading?: boolean;
  /** When set, replaces the default img/skeleton (e.g. lieutenant picker). */
  children?: ReactNode;
};

/** Img preview or skeleton+spinner placeholder. */
export function GlancePreviewSlot({
  previewUrl,
  alt,
  loading = false,
  children,
}: PreviewSlotProps) {
  if (children) return <div className="db-glance-slot">{children}</div>;
  return (
    <div className="db-glance-slot">
      {previewUrl ? (
        <img src={previewUrl} alt={alt} className="db-glance-preview" />
      ) : (
        <div className="db-glance-skeleton" aria-hidden="true">
          {loading ? <span className="db-glance-spinner" /> : null}
        </div>
      )}
    </div>
  );
}

type StatusLineProps = {
  loading?: boolean;
  loadingText?: string;
  error?: string | null;
  statusLine?: string | null;
  statusTitle?: string | null;
  children?: ReactNode;
};

/** Statusline region: optional lead content, loading, error, or success status. */
export function GlanceStatusLine({
  loading = false,
  loadingText = 'Generating glance image…',
  error = null,
  statusLine = null,
  statusTitle = null,
  children,
}: StatusLineProps) {
  return (
    <div className="db-glance-statusline">
      {children}
      {loading ? <p>{loadingText}</p> : null}
      {error ? <p className="db-error">{error}</p> : null}
      {!loading && !error && statusLine ? (
        <p className="db-glance-status" title={statusTitle || undefined}>
          {statusLine}
        </p>
      ) : null}
    </div>
  );
}

type ActionShellProps = {
  onClose: () => void;
  closeLabel?: string;
  onDownload?: () => void;
  onCopy?: () => void;
  /** True when there is no PNG blob to download/copy. */
  downloadDisabled?: boolean;
  /** Extra buttons between Close and Download (rarely used; primary Generate lives in chrome). */
  children?: ReactNode;
  /** Inserted after Download (e.g. Download all). */
  afterDownload?: ReactNode;
};

/** Modal footer: Close + Download/Copy (primary Generate/Continue live in `.db-glance-chrome`). */
export function GlanceModalActions({
  onClose,
  closeLabel = 'Close',
  onDownload,
  onCopy,
  downloadDisabled = true,
  children,
  afterDownload,
}: ActionShellProps) {
  const copyDisabled = !(canCopyPng() && !downloadDisabled);
  const showDownloadCopy = Boolean(onDownload || onCopy);
  return (
    <div className="db-modal-actions">
      <button type="button" className="db-btn" onClick={onClose}>
        {closeLabel}
      </button>
      {children}
      {showDownloadCopy ? (
        <>
          {onDownload ? (
            <button type="button" className="db-btn" disabled={downloadDisabled} onClick={onDownload}>
              Download
            </button>
          ) : null}
          {afterDownload}
          {onCopy ? (
            <button
              type="button"
              className="db-btn"
              disabled={copyDisabled}
              onClick={() => void onCopy()}
            >
              Copy image
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
