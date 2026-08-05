import { useCallback, useMemo, useState } from 'react';
import type { DeckDocument, GlanceCard, GlanceLayoutMode } from '@rayenz-hub/shared';
import { GLANCE_ROLE_HIGHLIGHT_LIMIT, listGlanceLieutenants } from '@rayenz-hub/shared';
import { CardFace } from '../../cards/CardFace';
import { isApiConfigured } from '../../api/hub-api';
import { apiPostDeckGlance } from '../store/deck-glance-api';
import { copyPngBlob, downloadPngBlob } from '../../lib/glance-png';
import {
  formatGlanceStatusLine,
  GlanceModalActions,
  GlancePreviewSlot,
  GlanceStatusLine,
} from '../../lib/glance-ui';

type Props = {
  deck: DeckDocument;
};

type Phase = 'pick' | 'options';

type CachedPreview = {
  blob: Blob;
  url: string;
  statusLine: string;
  lieutenantInstanceIds: string[];
};

function cacheKey(mode: GlanceLayoutMode, lieutenantInstanceIds: string[]): string {
  return `${mode}|${lieutenantInstanceIds.slice().sort().join(',')}`;
}

export function GlanceGenerateButton({ deck }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('options');
  const [mode, setMode] = useState<GlanceLayoutMode>('type_line');
  const [picked, setPicked] = useState<string[]>([]);
  const [lieutenantIds, setLieutenantIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, CachedPreview>>({});

  const apiReady = isApiConfigured();
  const hasDeckId = Boolean(deck.deckId);
  const enabled = apiReady && deck.format === 'commander';

  const lieutenants = useMemo<GlanceCard[]>(() => {
    if (deck.format !== 'commander') return [];
    return listGlanceLieutenants(deck);
  }, [deck]);
  const needsPick = lieutenants.length > GLANCE_ROLE_HIGHLIGHT_LIMIT;

  const clearVisiblePreview = useCallback(() => {
    setPreviewUrl(null);
    setPngBlob(null);
    setStatusLine(null);
  }, []);

  const revokeAllCache = useCallback((entries: Record<string, CachedPreview>) => {
    for (const entry of Object.values(entries)) {
      URL.revokeObjectURL(entry.url);
    }
  }, []);

  const closeDialog = useCallback(() => {
    setOpen(false);
    setError(null);
    setPhase('options');
    setMode('type_line');
    setLieutenantIds([]);
    clearVisiblePreview();
    setCache((prev) => {
      revokeAllCache(prev);
      return {};
    });
  }, [clearVisiblePreview, revokeAllCache]);

  const showCached = useCallback((entry: CachedPreview) => {
    setPngBlob(entry.blob);
    setPreviewUrl(entry.url);
    setStatusLine(entry.statusLine);
    setError(null);
  }, []);

  const applyMode = useCallback(
    (next: GlanceLayoutMode, ids: string[]) => {
      setMode(next);
      const key = cacheKey(next, ids);
      const hit = cache[key];
      if (hit) {
        showCached(hit);
        return;
      }
      clearVisiblePreview();
    },
    [cache, clearVisiblePreview, showCached],
  );

  const generate = useCallback(
    async (ids: string[], layoutMode: GlanceLayoutMode) => {
      setPhase('options');
      setLieutenantIds(ids);
      setMode(layoutMode);
      setLoading(true);
      setError(null);
      clearVisiblePreview();
      const key = cacheKey(layoutMode, ids);
      try {
        if (!hasDeckId) {
          throw new Error('Save this deck to the Hub API before generating a glance image.');
        }
        const result = await apiPostDeckGlance(deck.deckId, {
          ...(ids.length ? { lieutenantInstanceIds: ids } : {}),
          mode: layoutMode,
        });
        const url = URL.createObjectURL(result.blob);
        const line = formatGlanceStatusLine({
          generation: result.generation,
          cache: result.cache,
          delivery: result.delivery,
        });
        const entry: CachedPreview = {
          blob: result.blob,
          url,
          statusLine: line,
          lieutenantInstanceIds: ids,
        };
        setCache((prev) => {
          const old = prev[key];
          if (old) URL.revokeObjectURL(old.url);
          return { ...prev, [key]: entry };
        });
        setPngBlob(entry.blob);
        setPreviewUrl(entry.url);
        setStatusLine(entry.statusLine);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to generate glance image.');
      } finally {
        setLoading(false);
      }
    },
    [clearVisiblePreview, deck.deckId, hasDeckId],
  );

  const onModeChange = useCallback(
    (next: GlanceLayoutMode) => {
      if (next === mode || loading) return;
      applyMode(next, lieutenantIds);
    },
    [applyMode, lieutenantIds, loading, mode],
  );

  const onOpen = useCallback(() => {
    if (!apiReady) {
      setError('Hub API is required to generate a glance image. Configure API URL and key in settings.');
      setOpen(true);
      setPhase('options');
      return;
    }
    if (!hasDeckId) {
      setError('Save this deck to the Hub API before generating a glance image.');
      setOpen(true);
      setPhase('options');
      return;
    }
    if (deck.format !== 'commander') {
      setError('Glance is supported for Commander decks only.');
      setOpen(true);
      setPhase('options');
      return;
    }

    setOpen(true);
    setError(null);
    if (needsPick) {
      clearVisiblePreview();
      setPicked(lieutenants.slice(0, GLANCE_ROLE_HIGHLIGHT_LIMIT).map((c) => c.instanceId));
      setPhase('pick');
      return;
    }
    setLieutenantIds([]);
    setPhase('options');
    applyMode(mode, []);
  }, [
    apiReady,
    applyMode,
    clearVisiblePreview,
    deck.format,
    hasDeckId,
    lieutenants,
    mode,
    needsPick,
  ]);

  const togglePicked = useCallback((instanceId: string) => {
    setPicked((prev) => {
      if (prev.includes(instanceId)) return prev.filter((id) => id !== instanceId);
      if (prev.length >= GLANCE_ROLE_HIGHLIGHT_LIMIT) return prev;
      return [...prev, instanceId];
    });
  }, []);

  const onConfirmPick = useCallback(() => {
    setLieutenantIds(picked);
    setPhase('options');
    applyMode(mode, picked);
  }, [applyMode, mode, picked]);

  const onConfirmGenerate = useCallback(() => {
    void generate(lieutenantIds, mode);
  }, [generate, lieutenantIds, mode]);

  const onDownload = useCallback(() => {
    if (!pngBlob) return;
    downloadPngBlob(pngBlob, `${deck.name || 'deck'}-glance.png`);
  }, [deck.name, pngBlob]);

  const onCopy = useCallback(async () => {
    if (!pngBlob) return;
    await copyPngBlob(pngBlob);
  }, [pngBlob]);

  const picking = phase === 'pick';
  const canConfirmPick = picked.length === GLANCE_ROLE_HIGHLIGHT_LIMIT;
  const hasMatchingPreview = Boolean(previewUrl && pngBlob);

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
        onClick={onOpen}
      >
        Generate glance
      </button>

      {open ? (
        <div
          className="db-modal db-glance-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={picking ? 'Choose highlighted lieutenants' : 'Deck glance'}
        >
          <div className="db-modal-card db-modal-wide db-glance-modal">
            <h2>{picking ? 'Highlight lieutenants' : 'Deck glance'}</h2>
            {!picking ? (
              <fieldset className="db-glance-mode">
                <legend>Layout</legend>
                <label className="db-glance-option">
                  <input
                    type="radio"
                    name="db-glance-mode"
                    checked={mode === 'type_line'}
                    disabled={loading}
                    onChange={() => onModeChange('type_line')}
                  />
                  Main + Lands
                </label>
                <label className="db-glance-option">
                  <input
                    type="radio"
                    name="db-glance-mode"
                    checked={mode === 'primary_category'}
                    disabled={loading}
                    onChange={() => onModeChange('primary_category')}
                  />
                  Primary categories
                </label>
              </fieldset>
            ) : null}
            <GlanceStatusLine
              loading={loading}
              error={error}
              statusLine={!picking ? statusLine : null}
            >
              {picking ? (
                <p className="db-glance-status">
                  {`This deck has ${lieutenants.length} lieutenants. Choose ${GLANCE_ROLE_HIGHLIGHT_LIMIT} to highlight (${picked.length}/${GLANCE_ROLE_HIGHLIGHT_LIMIT} selected).`}
                </p>
              ) : null}
              {!picking && !loading && !error && !hasMatchingPreview ? (
                <p className="db-glance-status">Choose a layout, then generate.</p>
              ) : null}
            </GlanceStatusLine>
            {picking ? (
              <GlancePreviewSlot previewUrl={null} alt="" loading={false}>
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
              </GlancePreviewSlot>
            ) : (
              <GlancePreviewSlot
                previewUrl={previewUrl}
                alt="Deck glance preview"
                loading={loading}
              />
            )}
            <GlanceModalActions
              onClose={closeDialog}
              closeLabel={picking ? 'Cancel' : 'Close'}
              onDownload={picking ? undefined : onDownload}
              onCopy={picking ? undefined : onCopy}
              downloadDisabled={!pngBlob}
            >
              {picking ? (
                <button
                  type="button"
                  className="db-btn"
                  disabled={!canConfirmPick}
                  onClick={onConfirmPick}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="db-btn"
                  disabled={loading || !enabled}
                  onClick={onConfirmGenerate}
                >
                  {hasMatchingPreview ? 'Regenerate' : 'Generate'}
                </button>
              )}
            </GlanceModalActions>
          </div>
        </div>
      ) : null}
    </>
  );
}
