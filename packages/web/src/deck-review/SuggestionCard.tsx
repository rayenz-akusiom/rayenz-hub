import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { scryfallImageFromId, scryfallImageFromPrinting } from '../lib/hub-utils';
import type { ReviewProgress } from '../lib/hub-storage';
import {
  buildAcceptedSeeking,
  buildAcceptedSwap,
  decisionStatusClass,
  decisionStatusText,
  getDecision,
  type AcceptSelections,
} from './decisions';
import {
  canNeverSuggestOutCut,
  fetchPrintings,
  getSuggestionStaleness,
  hasSuggestedCut,
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
import { persistAcceptedSuggestion } from '../deck-suggest/accept';
import type { AcceptKind, ReviewDecision, ScryfallPrint } from './types';

type SuggestionCardProps = {
  deck: DeckEntry;
  suggestion: Suggestion;
  progress: ReviewProgress;
  advanceOnAction: boolean;
  compact?: boolean;
  progressLabel?: string;
  onDecision: (suggestionId: string, decision: ReviewDecision, advance: boolean) => void;
  onProfileUpdate: (patch: {
    deckPrefs?: Record<string, { blocked_cards: string[]; protected_cards: string[] }>;
    profilesConnected?: boolean;
    profileStatus?: string;
  }) => void;
  onError?: (message: string) => void;
  deckPrefs: Record<string, { blocked_cards: string[]; protected_cards: string[] }>;
};

export function SuggestionCard({
  deck,
  suggestion,
  progress,
  advanceOnAction,
  compact = false,
  progressLabel,
  onDecision,
  onProfileUpdate,
  onError,
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
  const [detailsOpen, setDetailsOpen] = useState(!compact);
  const [acceptKind, setAcceptKind] = useState<AcceptKind>('swap');
  const [saving, setSaving] = useState(false);
  const cutMeta = useMemo(() => cutMetaFromKey(cutKey, cutOptions), [cutKey, cutOptions]);
  const seekingMode = acceptKind === 'seeking';

  useEffect(() => {
    setDetailsOpen(!compact);
  }, [compact, suggestion.suggestion_id]);

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
      setAcceptKind(accepted.accept_kind || (accepted.swap_categories === false ? 'seeking' : 'swap'));
      if (accepted.card_in?.scryfall_id) {
        setPrintId(accepted.card_in.scryfall_id);
        setFinish(accepted.card_in.finish || 'nonfoil');
      }
      if (accepted.card_out?.name) {
        setCutKey(
          [accepted.card_out.name, accepted.card_out.set_code || '', accepted.card_out.collector_number || ''].join('|'),
        );
      }
      return;
    }
    setAcceptKind('swap');
  }, [decision, suggestion.suggestion_id]);

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
  const canNeverOut = canWrite && canNeverSuggestOutCut(suggestion, cutMeta.name);
  const neverBtnTitle = canWrite
    ? undefined
    : 'Profile updates require a configured Hub API or desktop Chrome on PC.';
  const neverOutBtnTitle = !canWrite
    ? neverBtnTitle
    : !hasSuggestedCut(suggestion)
      ? 'No original cut was suggested — protect cuts only apply to the suggested Out card.'
      : !cutMeta.name
        ? 'Select the originally suggested cut first.'
        : !canNeverSuggestOutCut(suggestion, cutMeta.name)
          ? 'Cut was changed — Never suggest again only applies to the originally suggested Out card.'
          : undefined;

  async function handleAccept() {
    if (saving) {
      return;
    }
    let accepted;
    if (seekingMode) {
      const result = buildAcceptedSeeking(deck, suggestion, { printId, finish, prints });
      if ('error' in result) {
        onProfileUpdate({ profileStatus: result.error });
        return;
      }
      accepted = result;
    } else {
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
      accepted = result;
    }
    setSaving(true);
    try {
      await persistAcceptedSuggestion(suggestion as Parameters<typeof persistAcceptedSuggestion>[0], accepted);
      onDecision(String(suggestion.suggestion_id), { status: 'accepted', accepted }, advanceOnAction);
      onProfileUpdate({
        profileStatus:
          accepted.accept_kind === 'seeking'
            ? 'Saved Seeking to Hub.'
            : 'Saved formal swap to Hub.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(msg);
      onProfileUpdate({ profileStatus: msg });
    } finally {
      setSaving(false);
    }
  }

  function handleSkipReject(nextStatus: 'skipped' | 'rejected') {
    onDecision(String(suggestion.suggestion_id), { status: nextStatus }, advanceOnAction);
  }

  const acceptRef = useRef(() => {
    void handleAccept();
  });
  const skipRejectRef = useRef(handleSkipReject);
  acceptRef.current = () => {
    void handleAccept();
  };
  skipRejectRef.current = handleSkipReject;

  async function handleNever(side: 'in' | 'out') {
    const inName = selectedInCardName(suggestion, printId, prints);
    const cardLabel = side === 'in' ? inName : cutMeta.name;
    if (!cardLabel) {
      onProfileUpdate({ profileStatus: 'Select a card first.' });
      return;
    }
    if (side === 'out' && !canNeverSuggestOutCut(suggestion, cutMeta.name)) {
      onProfileUpdate({
        profileStatus: !hasSuggestedCut(suggestion)
          ? 'No original cut was suggested.'
          : 'Cut was changed from the original suggestion.',
      });
      return;
    }
    const confirmed = window.confirm(
      side === 'in'
        ? `Never suggest “${cardLabel}” for this deck again?`
        : `Never suggest cutting “${cardLabel}” from this deck again?`,
    );
    if (!confirmed) {
      return;
    }
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

  useEffect(() => {
    if (!advanceOnAction) {
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      if (document.querySelector('.hub-picker-dialog')) {
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'a') {
        e.preventDefault();
        acceptRef.current();
      } else if (key === 's') {
        e.preventDefault();
        skipRejectRef.current('skipped');
      } else if (key === 'r') {
        e.preventDefault();
        skipRejectRef.current('rejected');
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [advanceOnAction]);

  const showDetails = !compact || detailsOpen;
  const inImgSrc = printId ? scryfallImageFromId(printId) : undefined;
  const warningLine = showDetails && staleness.stale ? staleness.reasons.join(' ') : '';

  return (
    <div
      className={
        'dr-suggestion-card' +
        (compact ? ' dr-suggestion-compact' : '') +
        (compact && detailsOpen ? ' is-expanded' : '') +
        (suggestion.priority_tier === 'swap' ? ' swap-tier' : '') +
        decisionStatusClass(status) +
        (missingCut && !seekingMode ? ' dr-missing-cut' : '') +
        (seekingMode ? ' dr-accept-seeking' : '') +
        staleClass
      }
      data-suggestion-id={String(suggestion.suggestion_id)}
    >
      <div className="dr-suggestion-body">
        <div className="dr-accept-mode" role="group" aria-label="Accept as">
          <button
            type="button"
            className={'dr-btn dr-btn-ghost dr-accept-mode-btn' + (!seekingMode ? ' is-active' : '')}
            aria-pressed={!seekingMode}
            onClick={() => setAcceptKind('swap')}
          >
            Swap
          </button>
          <button
            type="button"
            className={'dr-btn dr-btn-ghost dr-accept-mode-btn' + (seekingMode ? ' is-active' : '')}
            aria-pressed={seekingMode}
            onClick={() => setAcceptKind('seeking')}
          >
            Seeking
          </button>
        </div>
        <div className="dr-swap-pair">
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
              <img data-dr-img-in src={inImgSrc} alt="" />
            </button>
          </div>

          {!seekingMode ? (
            <>
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
              </div>
            </>
          ) : (
            <div className="dr-swap-col dr-swap-seeking-note">
              <div className="dr-swap-label">Seeking</div>
              <p className="dr-meta">No cut — add In to Seeking only.</p>
            </div>
          )}
        </div>

        <div className="dr-reasoning dr-reasoning-header">
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
            {status ? (
              <span className={'dr-decision-label dr-decision-label-' + status}>{decisionStatusText(status)}</span>
            ) : null}
          </div>
          <h3>{card.name}</h3>
        </div>

        {warningLine ? (
          <p className={'dr-edge-warning' + (staleness.stale ? ' dr-edge-warning-stale' : '')}>
            {warningLine}
          </p>
        ) : null}

        {showDetails ? (
          <>
            <div className="dr-swap-summaries">
              <div className="dr-swap-summary-col">
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
              {!seekingMode ? (
                <div className="dr-swap-summary-col">
                  <p className="dr-picker-summary">{cutSummaryLabel(cutMeta, cutOptions)}</p>
                  <button
                    type="button"
                    className="dr-btn dr-btn-ghost dr-never-btn"
                    disabled={!canNeverOut}
                    title={neverOutBtnTitle}
                    onClick={() => void handleNever('out')}
                  >
                    Never suggest again
                  </button>
                </div>
              ) : null}
            </div>
            <div className="dr-reasoning dr-reasoning-detail">
              <p className="dr-rationale">{String(suggestion.rationale || '')}</p>
              <p className="dr-roles">
                Roles: {((suggestion.roles_matched || []) as string[]).join(', ')}
              </p>
            </div>
          </>
        ) : null}

        {compact ? (
          <button
            type="button"
            className="dr-btn dr-btn-ghost dr-compact-expand"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? 'Hide details' : 'Show details'}
          </button>
        ) : null}
      </div>

      <div className={'dr-actions-bar' + (advanceOnAction ? ' is-sticky' : '')}>
        {progressLabel && advanceOnAction ? <p className="dr-actions-progress">{progressLabel}</p> : null}
        <div className="dr-actions">
          <button type="button" className="dr-btn dr-btn-ghost" onClick={() => handleSkipReject('skipped')}>
            Skip
          </button>
          <button type="button" className="dr-btn dr-btn-danger" onClick={() => handleSkipReject('rejected')}>
            Reject
          </button>
          <button
            type="button"
            className="dr-btn dr-btn-success"
            disabled={saving}
            onClick={() => void handleAccept()}
          >
            {saving ? 'Saving…' : seekingMode ? 'Accept Seeking' : 'Accept'}
          </button>
        </div>
        {advanceOnAction ? (
          <p className="dr-shortcut-hint" aria-hidden="true">
            Shortcuts: <kbd>A</kbd> Accept · <kbd>S</kbd> Skip · <kbd>R</kbd> Reject · <kbd>J</kbd>/<kbd>K</kbd> prev/next
          </p>
        ) : null}
      </div>
    </div>
  );
}
