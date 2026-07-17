import { useEffect, useMemo, useState } from 'react';
import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { scryfallImageFromId, scryfallImageFromPrinting } from '../lib/hub-utils';
import type { ReviewProgress } from '../lib/hub-storage';
import {
  buildAcceptedSwap,
  decisionStatusClass,
  decisionStatusText,
  getDecision,
  type AcceptSelections,
} from './decisions';
import {
  fetchPrintings,
  getSuggestionStaleness,
  isMissingSuggestedCut,
  resolveDefaultCutKey,
} from './data';
import {
  cutMetaFromKey,
  cutSummaryLabel,
  deckCutOptions,
  openCutPicker,
  openPrintPicker,
  printSummaryLabel,
} from './pickers';
import {
  addRuntimePreference,
  canWriteProfiles,
  neverSuggestAgain,
  selectedInCardName,
} from './profiles';
import type { ReviewDecision, ScryfallPrint } from './types';

type SuggestionCardProps = {
  deck: DeckEntry;
  suggestion: Suggestion;
  progress: ReviewProgress;
  advanceOnAction: boolean;
  onDecision: (suggestionId: string, decision: ReviewDecision, advance: boolean) => void;
  onProfileUpdate: (patch: {
    deckPrefs?: Record<string, { blocked_cards: string[]; protected_cards: string[] }>;
    profilesConnected?: boolean;
    profileStatus?: string;
  }) => void;
  deckPrefs: Record<string, { blocked_cards: string[]; protected_cards: string[] }>;
};

export function SuggestionCard({
  deck,
  suggestion,
  progress,
  advanceOnAction,
  onDecision,
  onProfileUpdate,
  deckPrefs,
}: SuggestionCardProps) {
  const decision = getDecision(progress, String(suggestion.suggestion_id));
  const status = decision?.status || '';
  const card = suggestion.card as {
    name: string;
    scryfall_id?: string;
    set_code?: string;
    collector_number?: string;
  };
  const cutOptions = useMemo(() => deckCutOptions(deck), [deck]);
  const missingCut = isMissingSuggestedCut(suggestion);
  const staleness = getSuggestionStaleness(deck, suggestion);
  const staleClass = staleness.stale
    ? staleness.level === 'fully_queued'
      ? ' dr-suggestion-fully-queued'
      : ' dr-suggestion-stale'
    : '';

  const [prints, setPrints] = useState<ScryfallPrint[]>([]);
  const [printId, setPrintId] = useState('');
  const [finish, setFinish] = useState('nonfoil');
  const [cutKey, setCutKey] = useState('');
  const cutMeta = useMemo(() => cutMetaFromKey(cutKey, cutOptions), [cutKey, cutOptions]);

  useEffect(() => {
    let cancelled = false;
    void fetchPrintings(card.name, { defaultScryfallId: card.scryfall_id }).then((loaded) => {
      if (cancelled) {
        return;
      }
      const list = loaded as ScryfallPrint[];
      setPrints(list);
      let defaultPrintId = card.scryfall_id || '';
      if (list.length && !list.some((p) => p.id === defaultPrintId)) {
        defaultPrintId = list[0].id;
      }
      setPrintId(defaultPrintId);
    }).catch(() => {
      if (!cancelled) {
        setPrints([]);
        setPrintId(card.scryfall_id || '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [card.name, card.scryfall_id]);

  useEffect(() => {
    setCutKey(resolveDefaultCutKey(deck, suggestion, cutOptions));
  }, [deck, suggestion, cutOptions]);

  useEffect(() => {
    if (decision?.status === 'accepted' && decision.accepted) {
      const accepted = decision.accepted;
      if (accepted.card_in?.scryfall_id) {
        setPrintId(accepted.card_in.scryfall_id);
        setFinish(accepted.card_in.finish || 'nonfoil');
      }
      if (accepted.card_out?.name) {
        setCutKey(
          [accepted.card_out.name, accepted.card_out.set_code || '', accepted.card_out.collector_number || ''].join('|'),
        );
      }
    }
  }, [decision]);

  const outImgSrc = useMemo(() => {
    if (!cutMeta.name) {
      return '';
    }
    if (cutMeta.set_code && cutMeta.collector_number) {
      return scryfallImageFromPrinting(cutMeta.set_code, cutMeta.collector_number);
    }
    const opt = cutOptions.find((o) => o.name === cutMeta.name);
    if (opt?.set_code && opt.collector_number) {
      return scryfallImageFromPrinting(opt.set_code, opt.collector_number);
    }
    return '';
  }, [cutMeta, cutOptions]);

  const canWrite = canWriteProfiles();
  const neverBtnTitle = canWrite
    ? undefined
    : 'Profile updates require a configured Hub API or desktop Chrome on PC.';

  function handleAccept() {
    const selections: AcceptSelections = {
      printId,
      finish,
      prints,
      cutMeta,
    };
    const result = buildAcceptedSwap(deck, suggestion, selections);
    if ('error' in result) {
      onProfileUpdate({ profileStatus: result.error });
      return;
    }
    onDecision(String(suggestion.suggestion_id), { status: 'accepted', accepted: result }, advanceOnAction);
  }

  function handleSkipReject(nextStatus: 'skipped' | 'rejected') {
    onDecision(String(suggestion.suggestion_id), { status: nextStatus }, advanceOnAction);
  }

  async function handleNever(side: 'in' | 'out') {
    const inName = selectedInCardName(suggestion, printId, prints);
    const result = await neverSuggestAgain(deck, suggestion, side, inName, cutMeta.name);
    if (!result.ok) {
      onProfileUpdate({ profileStatus: result.error });
      return;
    }
    const nextPrefs = addRuntimePreference(deckPrefs, deck.deck_id || '', result.field, result.cardName);
    const verb = result.changed ? 'Added' : 'Already listed';
    onProfileUpdate({
      deckPrefs: nextPrefs,
      profilesConnected: true,
      profileStatus: verb + ' ' + result.cardName + ' in ' + result.field.replace('_', ' ') + '.',
    });
    onDecision(String(suggestion.suggestion_id), { status: 'skipped' }, advanceOnAction);
  }

  return (
    <div
      className={
        'dr-suggestion-card' +
        (suggestion.priority_tier === 'swap' ? ' swap-tier' : '') +
        decisionStatusClass(status) +
        (missingCut ? ' dr-missing-cut' : '') +
        staleClass
      }
      data-suggestion-id={String(suggestion.suggestion_id)}
    >
      <div className="dr-reasoning">
        <div className="dr-badge-row">
          {suggestion.priority_tier === 'swap' ? <span className="dr-badge dr-badge-swap">Swap</span> : null}
          {staleness.stale ? (
            staleness.level === 'fully_queued' ? (
              <span className="dr-badge dr-badge-queued">Already queued</span>
            ) : (
              <span className="dr-badge dr-badge-stale">Stale</span>
            )
          ) : null}
          <span className={'dr-badge dr-badge-' + String(suggestion.confidence)}>{String(suggestion.confidence)}</span>
          <span className="dr-badge">{String(suggestion.action)}</span>
          {missingCut ? <span className="dr-badge dr-badge-missing-cut">No cut suggested</span> : null}
          {status ? (
            <span className={'dr-decision-label dr-decision-label-' + status}>{decisionStatusText(status)}</span>
          ) : null}
        </div>
        <h3>{card.name}</h3>
        <p className="dr-rationale">{String(suggestion.rationale || '')}</p>
        <p className="dr-roles">
          Roles: {((suggestion.roles_matched || []) as string[]).join(', ')}
        </p>
      </div>

      <div className="dr-swap-pair">
        {staleness.stale ? (
          <div className="dr-stale-notice-row">
            <p className="dr-stale-notice">{staleness.reasons.join(' ')}</p>
          </div>
        ) : null}
        {missingCut ? (
          <div className="dr-cut-warning-row">
            <p className="dr-cut-warning">
              No cut was suggested for this swap. Choose an Out card manually — the generator may have omitted{' '}
              <code>replaces</code>.
            </p>
          </div>
        ) : null}

        <div className="dr-swap-col dr-swap-in">
          <div className="dr-swap-label dr-swap-label-in">In</div>
          <button
            type="button"
            className="dr-card-image dr-card-image-btn"
            aria-label="Choose printing"
            onClick={() =>
              openPrintPicker(suggestion, prints, printId, finish === 'foil', (nextPrintId, nextFinish) => {
                setPrintId(nextPrintId);
                setFinish(nextFinish);
              })
            }
          >
            <img data-dr-img-in src={printId ? scryfallImageFromId(printId) : undefined} alt="" />
          </button>
          <p className="dr-picker-summary">{printSummaryLabel(printId, prints, suggestion, finish)}</p>
          <button
            type="button"
            className="dr-btn dr-btn-ghost dr-never-btn"
            disabled={!canWrite}
            title={neverBtnTitle}
            onClick={() => void handleNever('in')}
          >
            Never suggest again
          </button>
        </div>

        <div className="dr-swap-arrow" aria-hidden="true">
          →
        </div>

        <div className="dr-swap-col dr-swap-out">
          <div className="dr-swap-label dr-swap-label-out">Out</div>
          <button
            type="button"
            className={'dr-card-image dr-card-image-btn' + (missingCut && !cutMeta.name ? ' dr-card-image-empty' : '')}
            aria-label="Choose cut"
            onClick={() =>
              openCutPicker(deck, suggestion, cutOptions, cutKey, cutMeta, (key) => setCutKey(key))
            }
          >
            <img data-dr-img-out src={outImgSrc || undefined} alt="" />
          </button>
          <p className="dr-picker-summary">{cutSummaryLabel(cutMeta, cutOptions)}</p>
          <button
            type="button"
            className="dr-btn dr-btn-ghost dr-never-btn"
            disabled={!canWrite}
            title={neverBtnTitle}
            onClick={() => void handleNever('out')}
          >
            Never suggest again
          </button>
        </div>
      </div>

      <div className="dr-actions">
        <button type="button" className="dr-btn dr-btn-ghost" onClick={() => handleSkipReject('skipped')}>
          Skip
        </button>
        <button type="button" className="dr-btn dr-btn-danger" onClick={() => handleSkipReject('rejected')}>
          Reject
        </button>
        <button type="button" className="dr-btn dr-btn-success" onClick={handleAccept}>
          Accept
        </button>
      </div>
    </div>
  );
}
