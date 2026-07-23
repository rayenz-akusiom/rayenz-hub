import { useCallback, useState } from 'react';
import type { DeckDocument } from '@rayenz-hub/shared';
import { isApiConfigured } from '../../api/hub-api';
import { apiPostDeckGlance } from '../store/deck-api';

type Props = {
  deck: DeckDocument;
};

export function GlanceGenerateButton({ deck }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const apiReady = isApiConfigured();
  const hasDeckId = Boolean(deck.deckId);
  const enabled = apiReady && deck.format === 'commander';

  const resetPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPngBlob(null);
    setStatusLine(null);
  }, [previewUrl]);

  const closeDialog = useCallback(() => {
    setOpen(false);
    setError(null);
    resetPreview();
  }, [resetPreview]);

  const onGenerate = useCallback(async () => {
    if (!enabled) {
      if (!apiReady) {
        setError('Hub API is required to generate a glance image. Configure API URL and key in settings.');
      } else if (!hasDeckId) {
        setError('Save this deck to the Hub API before generating a glance image.');
      }
      setOpen(true);
      return;
    }

    setOpen(true);
    setLoading(true);
    setError(null);
    resetPreview();
    try {
      if (!hasDeckId) {
        throw new Error('Save this deck to the Hub API before generating a glance image.');
      }
      const result = await apiPostDeckGlance(deck.deckId);
      const url = URL.createObjectURL(result.blob);
      setPngBlob(result.blob);
      setPreviewUrl(url);
      const parts = ['Generated'];
      if (result.generation) parts.push(`gen ${result.generation}`);
      if (result.cache) parts.push(`cache ${result.cache}`);
      if (result.delivery === 'presigned') parts.push('presigned fetch');
      setStatusLine(parts.join(' · '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate glance image.');
    } finally {
      setLoading(false);
    }
  }, [apiReady, deck.deckId, enabled, hasDeckId, resetPreview]);

  const onDownload = useCallback(() => {
    if (!pngBlob) return;
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(pngBlob);
    anchor.download = `${deck.name || 'deck'}-glance.png`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }, [deck.name, pngBlob]);

  const onCopy = useCallback(async () => {
    if (!pngBlob || !navigator.clipboard?.write) return;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
  }, [pngBlob]);

  const canCopy =
    typeof ClipboardItem !== 'undefined' &&
    Boolean(navigator.clipboard?.write) &&
    Boolean(pngBlob);

  return (
    <>
      <button
        type="button"
        className="db-btn db-glance-generate"
        disabled={!enabled}
        title={
          !apiReady
            ? 'Configure Hub API to generate glance images'
            : !hasDeckId
              ? 'Save deck to Hub API first'
              : 'Generate deck glance image'
        }
        onClick={() => void onGenerate()}
      >
        Generate glance
      </button>

      {open ? (
        <div className="db-modal" role="dialog" aria-modal="true" aria-label="Deck glance preview">
          <div className="db-modal-card db-modal-wide db-glance-modal">
            <h2>Deck glance</h2>
            {loading ? <p>Generating glance image…</p> : null}
            {error ? <p className="db-error">{error}</p> : null}
            {statusLine ? <p className="db-glance-status">{statusLine}</p> : null}
            {previewUrl ? (
              <img src={previewUrl} alt="Deck glance preview" className="db-glance-preview" />
            ) : null}
            <div className="db-modal-actions">
              <button type="button" className="db-btn" onClick={closeDialog}>
                Close
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
      ) : null}
    </>
  );
}
