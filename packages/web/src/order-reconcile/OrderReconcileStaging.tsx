import { ArchidektExport } from '../mtg/archidekt-export';
import { bridgeApplyAvailable } from '../lib/hub-utils';
import { buildStagingImportText, countAcceptedRemovals } from './summary';
import type { OrderReconcileState } from './types';

export type OrderReconcileStagingProps = {
  state: OrderReconcileState;
  onStatus: (msg: string) => void;
};

export function OrderReconcileStaging({ state, onStatus }: OrderReconcileStagingProps) {
  const getDecision = (itemId: string) => state.progress.decisions[itemId] || null;
  const importText = buildStagingImportText(state.stagingDeck, state.reconcileItems, getDecision);
  const removalCount = countAcceptedRemovals(state.reconcileItems, getDecision);
  const staging = state.stagingDeck;

  function copyStaging() {
    void ArchidektExport.copyText(importText);
    onStatus('Staging import copied.');
  }

  function applyStaging() {
    if (!staging?.archidekt_url) return;
    const deckId = ArchidektExport.parseDeckId(staging.archidekt_url);
    ArchidektExport.stageDeckApply(deckId, importText);
    window.open(staging.archidekt_url, '_blank', 'noopener');
    onStatus('Staged staging deck — apply on Archidekt tab.');
  }

  return (
    <div className="or-status-card">
      <div className="or-status-header">
        <h3>Buy/trade list cleanup</h3>
        {staging?.archidekt_url ? (
          <a className="or-deck-link" href={staging.archidekt_url} target="_blank" rel="noopener">
            Open on Archidekt ↗
          </a>
        ) : null}
      </div>
      <div className="or-status-pane">
        <p>Remove {removalCount} accepted card(s) from staging deck.</p>
        <button type="button" className="or-btn or-btn-primary" onClick={copyStaging}>
          Copy staging import
        </button>{' '}
        {bridgeApplyAvailable() ? (
          <button type="button" className="or-btn or-btn-success" onClick={applyStaging}>
            Apply via bridge
          </button>
        ) : null}
        <textarea className="or-textarea" readOnly value={importText} style={{ marginTop: 12, minHeight: 120 }} />
      </div>
    </div>
  );
}
