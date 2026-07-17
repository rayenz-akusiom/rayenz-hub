import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { ArchidektExport } from '../mtg/archidekt-export';
import type { ReviewProgress } from '../lib/hub-storage';
import { BRIDGE_SCRIPT_URL, deriveSwapQueue, formatSwapQueueItem, getSuggestionStaleness, getSwapQueueReconciliation } from './data';
import {
  acceptedForDeck,
  decisionRecapInOut,
  decisionStatusLabel,
  getDecision,
} from './decisions';
import { isMissingSuggestedCut, needsSuggestedCut } from './data';
import { allVisibleSuggestions } from './review';
import { bridgeApplyAvailable, bridgeAvailable, stageDeckApply } from './archidekt-bridge';
import { archidektApplyOpenUrl } from './data';
import type { DeckPrefs, StatusCardTab, TransferSource } from './types';

type DeckReviewStatusCardProps = {
  deck: DeckEntry;
  progress: ReviewProgress;
  deckPrefs: Record<string, DeckPrefs>;
  statusCardTab: StatusCardTab;
  transferSource: TransferSource;
  onTabChange: (tab: StatusCardTab) => void;
  onRefreshDeck: () => void;
  onApplyStaged: (message: string) => void;
  onError: (message: string) => void;
};

function archidektDeckLink(deck: DeckEntry, label?: string) {
  if (!deck.archidekt_url) {
    return null;
  }
  const text = label || 'Open ' + deck.deck_name + ' on Archidekt';
  return (
    <a className="dr-deck-archidekt-link" href={deck.archidekt_url} target="_blank" rel="noopener">
      {text}
    </a>
  );
}

function DecisionsPane({
  deck,
  progress,
  deckPrefs,
}: {
  deck: DeckEntry;
  progress: ReviewProgress;
  deckPrefs: Record<string, DeckPrefs>;
}) {
  const suggestions = allVisibleSuggestions(deck, deckPrefs);
  if (!suggestions.length) {
    return <p className="dr-empty">No suggestions for this deck.</p>;
  }
  const reviewProgress = ArchidektExport.deckReviewComplete(suggestions, (id) => getDecision(progress, id));
  return (
    <>
      <p className="dr-decision-recap-meta">
        {reviewProgress.reviewed}/{reviewProgress.total} reviewed
      </p>
      <div className="dr-decision-recap-list">
        {suggestions.map((s) => {
          const decision = getDecision(progress, String(s.suggestion_id));
          const status = decision?.status || 'pending';
          const recap = decisionRecapInOut(s, decision);
          const stale = getSuggestionStaleness(deck, s);
          return (
            <div key={String(s.suggestion_id)} className={'dr-decision-recap-row dr-decision-recap-' + status}>
              <div
                className="dr-decision-recap-status"
                dangerouslySetInnerHTML={{
                  __html:
                    decisionStatusLabel(status) +
                    (stale.stale ? '<span class="dr-badge dr-badge-stale">Stale</span>' : ''),
                }}
              />
              <div className="dr-decision-recap-swap">
                <strong>{recap.inName}</strong>
                {recap.inSet ? <span className="dr-decision-recap-set"> ({recap.inSet})</span> : null}
                {recap.outName ? (
                  <> → {recap.outName}</>
                ) : needsSuggestedCut(s) ? (
                  <> → <em>(pick cut)</em></>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function QueuePane({
  deck,
  transferSource,
  onRefreshDeck,
}: {
  deck: DeckEntry;
  transferSource: TransferSource;
  onRefreshDeck: () => void;
}) {
  const queue = deriveSwapQueue(deck);
  const bridge = bridgeAvailable();

  if (!queue && !deck.deck_snapshot) {
    if (transferSource === 'deck-suggest') {
      return (
        <>
          {archidektDeckLink(deck, 'View deck on Archidekt')}
          <p className="dr-bridge-hint">
            Snapshot missing from Deck Suggest handoff — use Refresh or return to Deck Suggest.
          </p>
        </>
      );
    }
    return (
      <>
        {archidektDeckLink(deck, 'View deck on Archidekt')}
        <p className="dr-bridge-hint">
          No Archidekt snapshot. Re-run <code>enrich_suggestions.ps1</code>
          {!bridge ? (
            <>
              {' '}
              or install the{' '}
              <a href={BRIDGE_SCRIPT_URL} target="_blank" rel="noopener">
                Archidekt Deck Review Bridge
              </a>{' '}
              userscript for live refresh
            </>
          ) : null}
          .
        </p>
      </>
    );
  }

  if (!queue) {
    return <p className="dr-empty">No swap queue on this deck.</p>;
  }

  const recon = getSwapQueueReconciliation(deck);
  const fetchedAt = queue.fetched_at || 'unknown';
  const sourceLabel =
    transferSource === 'deck-suggest' && deck.deck_snapshot
      ? 'From Deck Suggest · as of ' + fetchedAt
      : 'From Archidekt · as of ' + fetchedAt;

  return (
    <>
      <div className="dr-swap-panel-meta">
        {archidektDeckLink(deck, 'View deck')}
        <span className="dr-swap-source">{sourceLabel}</span>
        {bridge ? (
          <button type="button" className="dr-btn dr-btn-ghost dr-swap-refresh" onClick={onRefreshDeck}>
            Refresh
          </button>
        ) : null}
      </div>
      <div className="dr-swap-cols">
        <div>
          <strong>In</strong>
          <ul>
            {(queue.new_set_in || []).length ? (
              queue.new_set_in.map((c) => (
                <li key={c.name} className={recon.uncoveredIn.includes(c.name) ? 'dr-swap-item-uncovered' : undefined}>
                  {formatSwapQueueItem(c)}
                </li>
              ))
            ) : (
              <li>
                <em>empty</em>
              </li>
            )}
          </ul>
        </div>
        <div>
          <strong>Out</strong>
          <ul>
            {(queue.new_set_out || []).length ? (
              queue.new_set_out.map((c) => (
                <li key={c.name} className={recon.uncoveredOut.includes(c.name) ? 'dr-swap-item-uncovered' : undefined}>
                  {formatSwapQueueItem(c)}
                </li>
              ))
            ) : (
              <li>
                <em>empty</em>
              </li>
            )}
          </ul>
        </div>
      </div>
      {recon.uncoveredIn.length || recon.uncoveredOut.length ? (
        <div className="dr-swap-reconcile-warning">
          No suggestion yet for{' '}
          {[
            recon.uncoveredIn.length ? 'In: ' + recon.uncoveredIn.join(', ') : '',
            recon.uncoveredOut.length ? 'Out: ' + recon.uncoveredOut.join(', ') : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      ) : null}
      {(queue.metadata_flags || []).length ? (
        <div className="dr-flags">
          {(queue.metadata_flags || []).map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
      ) : null}
      {!bridge ? (
        <p className="dr-bridge-hint">
          Install the{' '}
          <a href={BRIDGE_SCRIPT_URL} target="_blank" rel="noopener">
            Archidekt Deck Review Bridge
          </a>{' '}
          userscript for live refresh.
        </p>
      ) : null}
    </>
  );
}

function UpdatePane({
  deck,
  progress,
  deckPrefs,
  onApplyStaged,
  onError,
}: {
  deck: DeckEntry;
  progress: ReviewProgress;
  deckPrefs: Record<string, DeckPrefs>;
  onApplyStaged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const suggestions = allVisibleSuggestions(deck, deckPrefs);
  const reviewProgress = ArchidektExport.deckReviewComplete(suggestions, (id) => getDecision(progress, id));
  const hasSnapshot = !!(deck.deck_snapshot && Array.isArray(deck.deck_snapshot.cards));
  const accepted = acceptedForDeck(deck, progress);
  const acceptedSwaps = ArchidektExport.buildTargetAcceptedSwaps(accepted);
  const importText = hasSnapshot ? ArchidektExport.buildFullDeckImport(deck, acceptedSwaps) : '';
  const canApply = reviewProgress.complete && hasSnapshot && importText.trim().length > 0;

  async function handleCopy() {
    const text = ArchidektExport.buildFullDeckImport(deck, ArchidektExport.buildTargetAcceptedSwaps(accepted));
    await ArchidektExport.copyText(text);
  }

  function handleApply() {
    const text = ArchidektExport.buildFullDeckImport(deck, ArchidektExport.buildTargetAcceptedSwaps(accepted));
    const result = stageDeckApply(deck, text);
    if ('error' in result) {
      onError(result.error);
      return;
    }
    window.open(archidektApplyOpenUrl(deck.archidekt_url), '_blank', 'noopener');
    onApplyStaged('Staged — switch to the Archidekt tab and click Apply import on the banner.');
  }

  return (
    <>
      {!hasSnapshot ? (
        <p className="dr-update-gate">Refresh or enrich deck snapshot before applying.</p>
      ) : !reviewProgress.complete ? (
        <p className="dr-update-gate">
          Review all suggestions first ({reviewProgress.reviewed}/{reviewProgress.total}).
        </p>
      ) : !importText.trim() ? (
        <p className="dr-update-gate">Nothing to export for this deck.</p>
      ) : (
        <p className="dr-update-ready">All {reviewProgress.total} suggestions reviewed. Ready to update Archidekt.</p>
      )}
      <div className="dr-toolbar dr-update-actions">
        <button type="button" className="dr-btn dr-btn-primary" disabled={!canApply} onClick={() => void handleCopy()}>
          Copy full deck import
        </button>
        {bridgeApplyAvailable() ? (
          <button type="button" className="dr-btn dr-btn-primary" disabled={!canApply} onClick={handleApply}>
            Apply via bridge
          </button>
        ) : (
          <p className="dr-bridge-hint">
            Install or update the{' '}
            <a href={BRIDGE_SCRIPT_URL} target="_blank" rel="noopener">
              Archidekt Deck Review Bridge
            </a>{' '}
            userscript (2026-06-21.4+) to apply from desktop.
          </p>
        )}
        {archidektDeckLink(deck, 'Open on Archidekt')}
      </div>
      <p className="dr-import-hint">
        Desktop: Apply via bridge stages the import in Tampermonkey, then shows a banner on Archidekt. Tablet: Import →{' '}
        <strong>Replace deck</strong> → paste → Save.
      </p>
      <textarea id="dr-full-import-text" className="dr-import-preview" readOnly disabled={!canApply} value={importText} />
    </>
  );
}

export function DeckReviewStatusCard({
  deck,
  progress,
  deckPrefs,
  statusCardTab,
  transferSource,
  onTabChange,
  onRefreshDeck,
  onApplyStaged,
  onError,
}: DeckReviewStatusCardProps) {
  const tabClass = (name: StatusCardTab) => 'dr-status-tab' + (statusCardTab === name ? ' active' : '');

  return (
    <div className="dr-deck-status-card" id="dr-deck-status-card">
      <div className="dr-deck-status-header">
        <h3>Deck status</h3>
        <div className="dr-status-tabs">
          <button type="button" className={tabClass('decisions')} onClick={() => onTabChange('decisions')}>
            Decisions
          </button>
          <button type="button" className={tabClass('queue')} onClick={() => onTabChange('queue')}>
            Archidekt queue
          </button>
          <button type="button" className={tabClass('update')} onClick={() => onTabChange('update')}>
            Update
          </button>
        </div>
      </div>
      <div className="dr-status-pane" id="dr-status-pane-decisions" hidden={statusCardTab !== 'decisions'}>
        <DecisionsPane deck={deck} progress={progress} deckPrefs={deckPrefs} />
      </div>
      <div className="dr-status-pane" id="dr-status-pane-queue" hidden={statusCardTab !== 'queue'}>
        <QueuePane deck={deck} transferSource={transferSource} onRefreshDeck={onRefreshDeck} />
      </div>
      <div className="dr-status-pane" id="dr-status-pane-update" hidden={statusCardTab !== 'update'}>
        <UpdatePane deck={deck} progress={progress} deckPrefs={deckPrefs} onApplyStaged={onApplyStaged} onError={onError} />
      </div>
    </div>
  );
}
