import { useCallback, useMemo, useState } from 'react';
import type { DeckDocument, GlanceCard } from '@rayenz-hub/shared';
import { GLANCE_ROLE_HIGHLIGHT_LIMIT, listGlanceLieutenants } from '@rayenz-hub/shared';
import { CardFace } from '../../cards/CardFace';
import { isApiConfigured } from '../../api/hub-api';
import { apiPostDeckGlance } from '../store/deck-api';

type Props = {
  deck: DeckDocument;
};

type Phase = 'pick' | 'preview';

export function GlanceGenerateButton({ deck }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('preview');
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const apiReady = isApiConfigured();
  const hasDeckId = Boolean(deck.deckId);
  const enabled = apiReady && deck.format === 'commander';

  const lieutenants = useMemo<GlanceCard[]>(() => {
    if (deck.format !== 'commander') return [];
    return listGlanceLieutenants(deck);
  }, [deck]);
  const needsPick = lieutenants.length > GLANCE_ROLE_HIGHLIGHT_LIMIT;

  const resetPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPngBlob(null);
    setStatusLine(null);
  }, [previewUrl]);

  const closeDialog = useCallback(() => {
    setOpen(false);
    setError(null);
    setPhase('preview');
    resetPreview();
  }, [resetPreview]);

  const generate = useCallback(
    async (lieutenantInstanceIds: string[]) => {
      setPhase('preview');
      setLoading(true);
      setError(null);
      resetPreview();
      try {
        if (!hasDeckId) {
          throw new Error('Save this deck to the Hub API before generating a glance image.');
        }
        const result = await apiPostDeckGlance(
          deck.deckId,
          lieutenantInstanceIds.length ? { lieutenantInstanceIds } : {},
        );
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
    },
    [deck.deckId, hasDeckId, resetPreview],
  );

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
    if (needsPick) {
      setError(null);
      resetPreview();
      setPicked(lieutenants.slice(0, GLANCE_ROLE_HIGHLIGHT_LIMIT).map((c) => c.instanceId));
      setPhase('pick');
      return;
    }
    await generate([]);
  }, [apiReady, enabled, generate, hasDeckId, lieutenants, needsPick, resetPreview]);

  const togglePicked = useCallback((instanceId: string) => {
    setPicked((prev) => {
      if (prev.includes(instanceId)) return prev.filter((id) => id !== instanceId);
      if (prev.length >= GLANCE_ROLE_HIGHLIGHT_LIMIT) return prev;
      return [...prev, instanceId];
    });
  }, []);

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
  const picking = phase === 'pick';
  const canConfirmPick = picked.length === GLANCE_ROLE_HIGHLIGHT_LIMIT;

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
        <div
          className="db-modal db-glance-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={picking ? 'Choose highlighted lieutenants' : 'Deck glance preview'}
        >
          <div className="db-modal-card db-modal-wide db-glance-modal">
            <h2>{picking ? 'Highlight lieutenants' : 'Deck glance'}</h2>
            <div className="db-glance-statusline">
              {picking ? (
                <p className="db-glance-status">
                  {`This deck has ${lieutenants.length} lieutenants. Choose ${GLANCE_ROLE_HIGHLIGHT_LIMIT} to highlight (${picked.length}/${GLANCE_ROLE_HIGHLIGHT_LIMIT} selected).`}
                </p>
              ) : null}
              {loading ? <p>Generating glance image…</p> : null}
              {error ? <p className="db-error">{error}</p> : null}
              {!picking && !loading && !error && statusLine ? (
                <p className="db-glance-status">{statusLine}</p>
              ) : null}
            </div>
            <div className="db-glance-slot">
              {picking ? (
                <div
                  className="db-glance-pick-grid"
                  role="listbox"
                  aria-multiselectable="true"
                  aria-label="Lieutenants"
                >
                  {lieutenants.map((card) => {
                    const selected = picked.includes(card.instanceId);
                    return (
                      <button
                        key={card.instanceId}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`db-glance-pick-option${selected ? ' is-selected' : ''}`}
                        onClick={() => togglePicked(card.instanceId)}
                      >
                        <span className="db-glance-pick-face">
                          <CardFace
                            src={card.imageUrl}
                            name={card.name}
                            quantity={card.quantity}
                            faceKey={card.instanceId}
                          />
                        </span>
                        <span className="db-glance-pick-name">{card.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : previewUrl ? (
                <img src={previewUrl} alt="Deck glance preview" className="db-glance-preview" />
              ) : (
                <div className="db-glance-skeleton" aria-hidden="true">
                  {loading ? <span className="db-glance-spinner" /> : null}
                </div>
              )}
            </div>
            <div className="db-modal-actions">
              <button type="button" className="db-btn" onClick={closeDialog}>
                {picking ? 'Cancel' : 'Close'}
              </button>
              {picking ? (
                <button
                  type="button"
                  className="db-btn"
                  disabled={!canConfirmPick}
                  onClick={() => void generate(picked)}
                >
                  Generate
                </button>
              ) : (
                <>
                  <button type="button" className="db-btn" disabled={!pngBlob} onClick={onDownload}>
                    Download
                  </button>
                  <button
                    type="button"
                    className="db-btn"
                    disabled={!canCopy}
                    onClick={() => void onCopy()}
                  >
                    Copy image
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
