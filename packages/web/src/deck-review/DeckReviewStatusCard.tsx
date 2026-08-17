import { useState, type MouseEvent } from 'react';
import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { ArchidektExport } from '../mtg/archidekt-export';
import type { ReviewProgress } from '../lib/hub-storage';
import { scryfallImageFromId, scryfallImageFromName, scryfallImageFromPrinting } from '../lib/hub-utils';
import {
  cutOptionImageSrc,
  deriveSwapQueue,
  formatSwapQueueItem,
  getSuggestionStaleness,
  getSwapQueueReconciliation,
  needsSuggestedCut,
} from './data';
import {
  acceptedForDeck,
  decisionRecapInOut,
  decisionStatusLabel,
  getDecision,
} from './decisions';
import { allVisibleSuggestions } from './review';
import type { DeckPrefs, ReviewDecision, StatusCardTab, TransferSource } from './types';

const STATUS_EXPANDED_KEY = 'dr-status-expanded';

type DeckReviewStatusCardProps = {
  deck: DeckEntry;
  progress: ReviewProgress;
  deckPrefs: Record<string, DeckPrefs>;
  statusCardTab: StatusCardTab;
  transferSource: TransferSource;
  onTabChange: (tab: StatusCardTab) => void;
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
  if (rep.set_code && rep.collector_number) {
    return scryfallImageFromPrinting(rep.set_code, rep.collector_number);
  }
  return cutOptionImageSrc(
    {
      name: rep.name,
      set_code: rep.set_code || null,
      collector_number: rep.collector_number || null,
    },
    deck,
  );
}

function MiniFace({ src, label }: { src: string; label: string }) {
  if (!src) {
    return <span className="dr-decision-face-empty" aria-hidden="true" />;
  }
  return <img className="dr-decision-face" src={src} alt="" title={label} />;
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
                    <>
                      {' '}
                      → <em>Seeking</em>
                    </>
                  ) : recap.outName ? (
                    <> → {recap.outName}</>
                  ) : needsSuggestedCut(s) ? (
                    <>
                      {' '}
                      → <em>(pick cut)</em>
                    </>
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

function queueCardThumb(
  deck: DeckEntry,
  card: { name: string; set_code?: string; collector_number?: string },
): string {
  return cutOptionImageSrc(
    {
      name: card.name,
      set_code: card.set_code || null,
      collector_number: card.collector_number || null,
    },
    deck,
  );
}

function QueuePane({
  deck,
  transferSource,
}: {
  deck: DeckEntry;
  transferSource: TransferSource;
}) {
  const queue = deriveSwapQueue(deck);

  if (!queue && !deck.deck_snapshot) {
    return (
      <>
        <p className="dr-bridge-hint">
          {transferSource === 'deck-suggest' || transferSource === 'generate'
            ? 'Snapshot missing from generation — start a new source or regenerate.'
            : 'No Hub deck snapshot. Regenerate or upload suggestions that include library decks.'}
        </p>
      </>
    );
  }

  if (!queue) {
    return <p className="dr-empty">No swap queue on this deck.</p>;
  }

  const recon = getSwapQueueReconciliation(deck);
  const fetchedAt = queue.fetched_at || 'unknown';
  const fromRules =
    (transferSource === 'deck-suggest' || transferSource === 'generate') && deck.deck_snapshot;
  const sourceLabel = fromRules
    ? 'From generation · as of ' + fetchedAt
    : 'From Hub · as of ' + fetchedAt;

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
        <span className="dr-swap-source">{sourceLabel}</span>
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
    </>
  );
}

function ExportPane({
  deck,
  progress,
  deckPrefs,
  onApplyStaged,
}: {
  deck: DeckEntry;
  progress: ReviewProgress;
  deckPrefs: Record<string, DeckPrefs>;
  onApplyStaged: (message: string) => void;
}) {
  const suggestions = allVisibleSuggestions(deck, deckPrefs);
  const reviewProgress = ArchidektExport.deckReviewComplete(suggestions, (id) => getDecision(progress, id));
  const hasSnapshot = !!(deck.deck_snapshot && Array.isArray(deck.deck_snapshot.cards));
  const accepted = acceptedForDeck(deck, progress);
  const acceptedSwaps = ArchidektExport.buildTargetAcceptedSwaps(accepted);
  const importText = hasSnapshot ? ArchidektExport.buildFullDeckImport(deck, acceptedSwaps) : '';
  const canExport = reviewProgress.complete && hasSnapshot && importText.trim().length > 0;

  async function handleCopy() {
    const text = ArchidektExport.buildFullDeckImport(deck, ArchidektExport.buildTargetAcceptedSwaps(accepted));
    await ArchidektExport.copyText(text);
    onApplyStaged('Copied Archidekt import (mirror) to clipboard.');
  }

  return (
    <>
      {!hasSnapshot ? (
        <p className="dr-update-gate">Deck snapshot required before exporting a mirror import — regenerate or re-upload.</p>
      ) : !reviewProgress.complete ? (
        <p className="dr-update-gate">
          Review all suggestions first ({reviewProgress.reviewed}/{reviewProgress.total}).
        </p>
      ) : !importText.trim() ? (
        <p className="dr-update-gate">Nothing to export for this deck.</p>
      ) : (
        <p className="dr-update-ready">
          Accepts are saved on Hub. Optional: copy an Archidekt full-deck import to update your mirror.
        </p>
      )}
      <div className="dr-toolbar dr-update-actions">
        <button type="button" className="dr-btn dr-btn-primary" disabled={!canExport} onClick={() => void handleCopy()}>
          Copy Archidekt import
        </button>
      </div>
      <p className="dr-import-hint">
        Paste into Archidekt via Import → <strong>Replace deck</strong> → Save. Hub remains the system of record.
      </p>
      <textarea
        id="dr-full-import-text"
        className="dr-import-preview"
        readOnly
        disabled={!canExport}
        value={importText}
        aria-label="Archidekt import preview"
      />
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
  onApplyStaged,
  onError: _onError,
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
                Swap queue
              </button>
              <button type="button" className={tabClass('export')} onClick={() => onTabChange('export')}>
                Export
              </button>
            </div>
          </div>
          <div className="dr-status-pane" id="dr-status-pane-decisions" hidden={statusCardTab !== 'decisions'}>
            <DecisionsPane deck={deck} progress={progress} deckPrefs={deckPrefs} />
          </div>
          <div className="dr-status-pane" id="dr-status-pane-queue" hidden={statusCardTab !== 'queue'}>
            <QueuePane deck={deck} transferSource={transferSource} />
          </div>
          <div className="dr-status-pane" id="dr-status-pane-export" hidden={statusCardTab !== 'export'}>
            <ExportPane
              deck={deck}
              progress={progress}
              deckPrefs={deckPrefs}
              onApplyStaged={onApplyStaged}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
