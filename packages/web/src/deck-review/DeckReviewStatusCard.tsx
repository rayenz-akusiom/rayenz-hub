import { useState, type MouseEvent } from 'react';
import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { ArchidektExport } from '../mtg/archidekt-export';
import type { ReviewProgress } from '../lib/hub-storage';
import { scryfallImageFromId, scryfallImageFromName, scryfallImageFromPrinting } from '../lib/hub-utils';
import {
  BRIDGE_SCRIPT_URL,
  cutOptionImageSrc,
  deriveSwapQueue,
  findSnapshotCard,
  formatSwapQueueItem,
  getSuggestionStaleness,
  getSwapQueueReconciliation,
  needsSuggestedCut,
  archidektApplyOpenUrl,
} from './data';
import {
  acceptedForDeck,
  decisionRecapInOut,
  decisionStatusLabel,
  getDecision,
} from './decisions';
import { allVisibleSuggestions } from './review';
import { bridgeApplyAvailable, bridgeAvailable, stageDeckApply } from './archidekt-bridge';
import type { DeckPrefs, ReviewDecision, StatusCardTab, TransferSource } from './types';

const STATUS_EXPANDED_KEY = 'dr-status-expanded';

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

function readExpandedPreference(): boolean {
  try {
    return sessionStorage.getItem(STATUS_EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeExpandedPreference(expanded: boolean) {
  try {
    sessionStorage.setItem(STATUS_EXPANDED_KEY, expanded ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

function statusCounts(
  suggestions: Suggestion[],
  progress: ReviewProgress,
): { pending: number; accepted: number; rejected: number; skipped: number } {
  let pending = 0;
  let accepted = 0;
  let rejected = 0;
  let skipped = 0;
  for (const s of suggestions) {
    const status = getDecision(progress, String(s.suggestion_id))?.status || 'pending';
    if (status === 'accepted') accepted++;
    else if (status === 'rejected') rejected++;
    else if (status === 'skipped') skipped++;
    else pending++;
  }
  return { pending, accepted, rejected, skipped };
}

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

function decisionInThumb(suggestion: Suggestion, decision: ReviewDecision | null): string {
  if (decision?.status === 'accepted' && decision.accepted?.card_in?.scryfall_id) {
    return scryfallImageFromId(decision.accepted.card_in.scryfall_id);
  }
  const card = suggestion.card as {
    scryfall_id?: string;
    set_code?: string;
    collector_number?: string;
    name?: string;
  };
  if (card.scryfall_id) {
    return scryfallImageFromId(card.scryfall_id);
  }
  if (card.set_code && card.collector_number) {
    return scryfallImageFromPrinting(card.set_code, card.collector_number);
  }
  return scryfallImageFromName(card.name);
}

function decisionOutThumb(deck: DeckEntry, suggestion: Suggestion, decision: ReviewDecision | null): string {
  if (decision?.status === 'accepted' && decision.accepted?.card_out) {
    const out = decision.accepted.card_out;
    return cutOptionImageSrc(
      {
        name: out.name || '',
        set_code: out.set_code || null,
        collector_number: out.collector_number || null,
      },
      deck,
    );
  }
  const rep = (suggestion.replaces || [])[0] as
    | { name?: string; set_code?: string; collector_number?: string; scryfall_id?: string }
    | undefined;
  if (!rep?.name) {
    return '';
  }
  if (rep.scryfall_id) {
    return scryfallImageFromId(rep.scryfall_id);
  }
  return cutOptionImageSrc(
    { name: rep.name, set_code: rep.set_code || null, collector_number: rep.collector_number || null },
    deck,
  );
}

function queueCardThumb(
  deck: DeckEntry,
  card: { name: string; set_code?: string; collector_number?: string },
): string {
  if (card.set_code && card.collector_number) {
    return scryfallImageFromPrinting(card.set_code, card.collector_number);
  }
  const snap = findSnapshotCard(deck, card.name, card.set_code, card.collector_number);
  if (snap?.set_code && snap.collector_number) {
    return scryfallImageFromPrinting(snap.set_code, snap.collector_number);
  }
  return scryfallImageFromName(card.name);
}

function MiniFace({ src, label }: { src: string; label: string }) {
  return src ? (
    <img className="dr-mini-face" src={src} alt="" title={label} />
  ) : (
    <span className="dr-mini-face dr-mini-face-empty" title={label || '—'} />
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
          const inSrc = decisionInThumb(s, decision);
          const outSrc = decisionOutThumb(deck, s, decision);
          return (
            <div key={String(s.suggestion_id)} className={'dr-decision-recap-row dr-decision-recap-' + status}>
                <div className="dr-decision-recap-faces" aria-hidden="true">
                <MiniFace src={inSrc} label={recap.inName} />
                {recap.acceptKind === 'seeking' ? (
                  <span className="dr-decision-recap-arrow">Seeking</span>
                ) : (
                  <>
                    <span className="dr-decision-recap-arrow">→</span>
                    <MiniFace src={outSrc} label={recap.outName || '(pick cut)'} />
                  </>
                )}
              </div>
              <div className="dr-decision-recap-text">
                <div
                  className="dr-decision-recap-status"
                  dangerouslySetInnerHTML={{
                    __html:
                      decisionStatusLabel(status) +
                      (recap.acceptKind === 'seeking'
                        ? '<span class="dr-badge dr-badge-seeking">Seeking</span>'
                        : '') +
                      (stale.stale ? '<span class="dr-badge dr-badge-stale">Stale</span>' : ''),
                  }}
                />
                <div className="dr-decision-recap-swap">
                  <strong>{recap.inName}</strong>
                  {recap.inSet ? <span className="dr-decision-recap-set"> ({recap.inSet})</span> : null}
                  {recap.acceptKind === 'seeking' ? (
                    <> → <em>Seeking</em></>
                  ) : recap.outName ? (
                    <> → {recap.outName}</>
                  ) : needsSuggestedCut(s) ? (
                    <> → <em>(pick cut)</em></>
                  ) : null}
                </div>
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
    if (transferSource === 'deck-suggest' || transferSource === 'generate') {
      return (
        <>
          {archidektDeckLink(deck, 'View deck on Archidekt')}
          <p className="dr-bridge-hint">
            Snapshot missing from generation — use Refresh or start a new source.
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
    (transferSource === 'deck-suggest' || transferSource === 'generate') && deck.deck_snapshot
      ? 'From generation · as of ' + fetchedAt
      : 'From Archidekt · as of ' + fetchedAt;

  function renderQueueList(
    cards: Array<{ name: string; set_code?: string; collector_number?: string }>,
    uncovered: string[],
  ) {
    if (!cards.length) {
      return (
        <li>
          <em>empty</em>
        </li>
      );
    }
    return cards.map((c) => {
      const uncoveredItem = uncovered.includes(c.name);
      const thumb = queueCardThumb(deck, c);
      return (
        <li
          key={[c.name, c.set_code || '', c.collector_number || ''].join('|')}
          className={'dr-swap-queue-item' + (uncoveredItem ? ' dr-swap-item-uncovered' : '')}
        >
          <MiniFace src={thumb} label={c.name} />
          <span className="dr-swap-queue-label">{formatSwapQueueItem(c)}</span>
        </li>
      );
    });
  }

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
          <ul className="dr-swap-queue-list">{renderQueueList(queue.new_set_in || [], recon.uncoveredIn)}</ul>
        </div>
        <div>
          <strong>Out</strong>
          <ul className="dr-swap-queue-list">{renderQueueList(queue.new_set_out || [], recon.uncoveredOut)}</ul>
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
    onApplyStaged('Copied to clipboard.');
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
  const [expanded, setExpanded] = useState(readExpandedPreference);
  const suggestions = allVisibleSuggestions(deck, deckPrefs);
  const counts = statusCounts(suggestions, progress);
  const tabClass = (name: StatusCardTab) => 'dr-status-tab' + (statusCardTab === name ? ' active' : '');

  function setExpandedPref(next: boolean) {
    setExpanded(next);
    writeExpandedPreference(next);
  }

  function openQueue(e: MouseEvent) {
    e.stopPropagation();
    onTabChange('queue');
    setExpandedPref(true);
  }

  return (
    <div
      className={'dr-deck-status-card' + (expanded ? ' is-expanded' : ' is-collapsed')}
      id="dr-deck-status-card"
    >
      <div className="dr-status-summary">
        <button
          type="button"
          className="dr-status-summary-toggle"
          aria-expanded={expanded}
          onClick={() => setExpandedPref(!expanded)}
        >
          <span className="dr-status-summary-counts">
            {counts.pending} pending · {counts.accepted} accepted · {counts.rejected} rejected
            {counts.skipped ? ` · ${counts.skipped} skipped` : ''}
          </span>
          <span className="dr-status-summary-label">{expanded ? 'Collapse' : 'Open status'}</span>
        </button>
        {!expanded ? (
          <button type="button" className="dr-btn dr-btn-ghost dr-status-open-queue" onClick={openQueue}>
            Open queue
          </button>
        ) : null}
      </div>
      {expanded ? (
        <>
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
            <UpdatePane
              deck={deck}
              progress={progress}
              deckPrefs={deckPrefs}
              onApplyStaged={onApplyStaged}
              onError={onError}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
