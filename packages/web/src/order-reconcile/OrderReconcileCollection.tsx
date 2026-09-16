import { useMemo } from 'react';
import { CardFace } from '../cards/CardFace';
import type { CollectionApplyMode, CollectionMarkHit, OrderReconcileState } from './types';

function setLabel(setCode: string | null | undefined, collector: string | null | undefined, foil?: boolean): string {
  const set = String(setCode || '').trim();
  const cn = String(collector || '').trim();
  if (!set && !cn) return 'Unknown printing';
  const base = set ? `${set.toUpperCase()}${cn ? ` #${cn}` : ''}` : `#${cn}`;
  return foil ? `${base} · foil` : base;
}

function groupReplaceableByRow(hits: CollectionMarkHit[]): CollectionMarkHit[] {
  const seen = new Map<string, CollectionMarkHit>();
  for (const hit of hits) {
    const key = `${hit.deckId}:${hit.instanceId}`;
    if (!seen.has(key)) seen.set(key, hit);
  }
  return [...seen.values()];
}

type Props = {
  state: OrderReconcileState;
  onApplyModeChange: (mode: CollectionApplyMode) => void;
  onToggleReplace: (hitId: string, selected: boolean) => void;
  onMarkExact: () => void;
  onApplyReplaces: () => void;
  onContinueToDecks: () => void;
};

export function OrderReconcileCollection({
  state,
  onApplyModeChange,
  onToggleReplace,
  onMarkExact,
  onApplyReplaces,
  onContinueToDecks,
}: Props) {
  const plan = state.collectionPlan;
  const exactCount = plan?.exactBumpCount || 0;
  const exactRows = plan?.exactRowCount || 0;
  const replaceHits = plan?.replaceable || [];
  const replaceRows = useMemo(() => groupReplaceableByRow(replaceHits), [replaceHits]);
  const selectedReplaceCount = replaceRows.filter((h) => state.collectionReplaceSelected[h.hitId]).length;
  const binderCount = state.collections.length;
  const hasAnyMatch = exactCount > 0 || replaceRows.length > 0;

  return (
    <div className="or-collection-phase">
      <h3>Mark collection binders</h3>
      <p className="hub-muted">
        Mark sought binder rows from this order before assigning cards to decks. Owned counts only —
        deck Seeking and in-deck allocation stay unchanged.
      </p>

      {!binderCount ? (
        <div className="or-empty">
          <p>No collection binders in the Hub library.</p>
          <button type="button" className="or-btn or-btn-primary" onClick={onContinueToDecks}>
            Continue to decks
          </button>
        </div>
      ) : !hasAnyMatch ? (
        <div className="or-empty">
          <p>No sought binder matches for these acquired cards.</p>
          <button type="button" className="or-btn or-btn-primary" onClick={onContinueToDecks}>
            Continue to decks
          </button>
        </div>
      ) : (
        <>
          <div className="or-collection-mode" role="group" aria-label="Multi-binder apply mode">
            <span className="hub-muted">When a card appears in multiple binders:</span>
            <div className="or-collection-mode-toggles">
              <button
                type="button"
                className={'or-btn' + (state.collectionApplyMode === 'broadcast' ? ' is-active' : '')}
                aria-pressed={state.collectionApplyMode === 'broadcast'}
                onClick={() => onApplyModeChange('broadcast')}
              >
                All binders
              </button>
              <button
                type="button"
                className={'or-btn' + (state.collectionApplyMode === 'consume' ? ' is-active' : '')}
                aria-pressed={state.collectionApplyMode === 'consume'}
                onClick={() => onApplyModeChange('consume')}
              >
                One copy each
              </button>
            </div>
            <p className="hub-muted or-collection-mode-hint">
              {state.collectionApplyMode === 'broadcast'
                ? 'Each acquired copy marks +1 owned on every binder that still needs it.'
                : 'Each acquired copy fills at most one binder slot (greedy).'}
            </p>
          </div>

          <section className="or-collection-exact">
            <h4>
              Exact printing matches{' '}
              <span className="hub-muted">
                {exactCount} bump{exactCount === 1 ? '' : 's'} · {exactRows} row{exactRows === 1 ? '' : 's'}
              </span>
            </h4>
            <button
              type="button"
              className="or-btn or-btn-primary"
              disabled={!exactCount}
              onClick={onMarkExact}
            >
              Mark exact matches
            </button>
            {exactCount > 0 ? (
              <ul className="or-collection-hit-list">
                {plan!.exact.map((hit) => (
                  <li key={hit.hitId} className="or-collection-hit">
                    <span className="or-collection-hit-face">
                      <CardFace
                        src={hit.acquiredImageUrl || hit.currentImageUrl}
                        name={hit.cardName}
                        foil={Boolean(hit.acquiredFinish && /foil/i.test(hit.acquiredFinish) && !/non/i.test(hit.acquiredFinish))}
                        faceKey={hit.hitId}
                      />
                    </span>
                    <span className="or-collection-hit-meta">
                      <strong>{hit.cardName}</strong>
                      <br />
                      {hit.deckName}
                      <br />
                      <span className="hub-muted">
                        {setLabel(hit.acquiredSet, hit.acquiredCollector, Boolean(hit.currentFoil))}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hub-muted">No exact set/# matches among sought binder rows.</p>
            )}
          </section>

          <section className="or-collection-replace">
            <h4>
              Replace binder printing{' '}
              <span className="hub-muted">
                {replaceRows.length} row{replaceRows.length === 1 ? '' : 's'}
              </span>
            </h4>
            <p className="hub-muted">
              Name matches with a different (or unknown) binder printing. Opt in to update the inventory
              row to the acquired printing and mark owned.
            </p>
            {replaceRows.length ? (
              <>
                <div className="or-collection-replace-grid" role="listbox" aria-multiselectable="true" aria-label="Replaceable binder rows">
                  {replaceRows.map((hit) => {
                    const on = Boolean(state.collectionReplaceSelected[hit.hitId]);
                    const canReplacePrint =
                      Boolean(String(hit.acquiredSet || '').trim()) &&
                      Boolean(String(hit.acquiredCollector || '').trim());
                    return (
                      <button
                        key={hit.hitId}
                        type="button"
                        role="option"
                        aria-selected={on}
                        className={'or-collection-replace-option' + (on ? ' is-selected' : '')}
                        onClick={() => onToggleReplace(hit.hitId, !on)}
                      >
                        <span className="or-collection-replace-faces">
                          <CardFace
                            src={hit.currentImageUrl}
                            name={hit.cardName}
                            foil={hit.currentFoil}
                            faceKey={`${hit.hitId}-cur`}
                          />
                          <span className="hub-muted" aria-hidden="true">
                            →
                          </span>
                          <CardFace
                            src={hit.acquiredImageUrl || hit.currentImageUrl}
                            name={hit.cardName}
                            foil={Boolean(hit.acquiredFinish && /foil/i.test(hit.acquiredFinish) && !/non/i.test(hit.acquiredFinish))}
                            faceKey={`${hit.hitId}-acq`}
                          />
                        </span>
                        <span className="or-collection-hit-meta">
                          <strong>{hit.cardName}</strong>
                          <br />
                          {hit.deckName}
                          <br />
                          <span className="hub-muted">
                            {setLabel(hit.currentSet, hit.currentCollector, hit.currentFoil)}
                            {' → '}
                            {canReplacePrint
                              ? setLabel(hit.acquiredSet, hit.acquiredCollector)
                              : 'Mark owned (no printing on order)'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="or-btn or-btn-primary"
                  disabled={!selectedReplaceCount}
                  onClick={onApplyReplaces}
                >
                  Apply selected replacements ({selectedReplaceCount})
                </button>
              </>
            ) : (
              <p className="hub-muted">No printing replacements to review.</p>
            )}
          </section>

          <div className="or-collection-actions">
            <button type="button" className="or-btn or-btn-primary" onClick={onContinueToDecks}>
              Continue to decks
            </button>
          </div>
        </>
      )}
    </div>
  );
}
