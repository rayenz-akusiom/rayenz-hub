import { useMemo, useState } from 'react';
import { explainCard, formatReason } from './debug';
import { deckSuggestHeaderText, suggestQueueBadge } from './display';
import { collectDebugEntries } from './export';
import { PackagePanel } from './PackagePanel';
import type { DeckRecord, DeckResult, GenerationRun, SetScope, Suggestion } from './types';

function deckResultHasSuggestions(result: DeckResult): boolean {
  return !result.error && !result.skipped && (result.suggestions || []).length > 0;
}

function scryfallImageUrl(card: Suggestion['card']): string | null {
  const id = card.scryfall_id;
  if (!id || id.length < 3) return null;
  return `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
}

function queueBadgeLabel(badge: 'seeking' | 'swap_in'): string {
  return badge === 'seeking' ? 'Seeking' : 'In swap';
}

function ruleLozengeLabels(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const tag of tags || []) {
    if (!tag.startsWith('rule:')) continue;
    const label = tag.slice(5).trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function SuggestionCard({
  s,
  deck,
  accepted,
  onAccept,
  onDismiss,
}: {
  s: Suggestion;
  deck: DeckRecord;
  accepted?: boolean;
  onAccept?: (s: Suggestion) => void;
  onDismiss?: (id: string) => void;
}) {
  const rep = s.replaces && s.replaces[0];
  const img = scryfallImageUrl(s.card);
  const queueBadge = suggestQueueBadge(deck, s.card.name);
  const isSwap = s.priority_tier === 'swap';
  const confidence = s.confidence ? String(s.confidence) : '';
  const rules = ruleLozengeLabels(s.tags);
  const showActions = !accepted && (onAccept || onDismiss);
  return (
    <article
      className={'ds-suggestion-card' + (accepted ? ' ds-suggestion-card-accepted' : '')}
      aria-label={s.card.name}
    >
      {img ? (
        <img className="ds-suggestion-art" src={img} alt={s.card.name} loading="lazy" />
      ) : (
        <div className="ds-suggestion-art ds-suggestion-art-fallback" aria-hidden="true" />
      )}
      <div className="ds-suggestion-body">
        <div className="ds-suggestion-topline">
          {accepted ? <span className="ds-lozenge ds-lozenge-accepted">Accepted</span> : null}
          {isSwap ? <span className="ds-tier ds-tier-swap">swap</span> : null}
          {queueBadge ? (
            <span className={'ds-queue-badge ds-queue-badge-' + queueBadge}>
              {queueBadgeLabel(queueBadge)}
            </span>
          ) : null}
          {confidence ? (
            <span className={'ds-lozenge ds-lozenge-' + confidence}>{confidence}</span>
          ) : null}
          {rules.map((rule) => (
            <span key={rule} className="ds-lozenge ds-lozenge-rule">
              {rule}
            </span>
          ))}
        </div>
        {rep && rep.name ? <p className="ds-meta">Cut {rep.name}</p> : null}
        {s.rationale ? <p className="ds-suggestion-rationale">{s.rationale}</p> : null}
        {showActions ? (
          <div className="ds-actions">
            {onAccept ? (
              <button type="button" className="ds-btn ds-btn-primary" onClick={() => onAccept(s)}>
                Accept
              </button>
            ) : null}
            {onDismiss ? (
              <button type="button" className="ds-btn" onClick={() => onDismiss(s.suggestion_id)}>
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DeckResultBlock({
  result,
  compact,
  acceptedIds,
  onAccept,
  onDismiss,
}: {
  result: DeckResult;
  compact?: boolean;
  acceptedIds?: Set<string>;
  onAccept?: (deckId: string, s: Suggestion) => void;
  onDismiss?: (id: string) => void;
}) {
  return (
    <div className={'ds-deck-result' + (compact ? ' ds-deck-result-compact' : '')}>
      <h4>{deckSuggestHeaderText(result.deck)}</h4>
      {result.error ? (
        <p className="ds-error-inline">{result.error}</p>
      ) : result.skipped ? (
        <p className="ds-meta">{result.message || result.skip_reason}</p>
      ) : !(result.suggestions || []).length ? (
        <p className="ds-meta">No suggestions for this deck.</p>
      ) : (
        !compact && (
          <>
            <PackagePanel packages={result.packages} packaging={result.packaging} />
            <div className="ds-suggestion-grid">
              {(result.suggestions || []).map((s) => (
                <SuggestionCard
                  key={s.suggestion_id}
                  s={s}
                  deck={result.deck}
                  accepted={acceptedIds?.has(s.suggestion_id)}
                  onAccept={onAccept ? (sug) => onAccept(result.deck.deck_id, sug) : undefined}
                  onDismiss={onDismiss}
                />
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}

function SummaryCard({
  summary,
}: {
  summary: {
    totalSuggestions: number;
    totalSwap: number;
    totalNormal: number;
    setCodes: string[];
  };
}) {
  return (
    <div className="ds-summary">
      <h4>Summary</h4>
      <p className="ds-summary-total">
        <strong>{summary.totalSuggestions}</strong> suggestions ({summary.totalSwap} swap ·{' '}
        {summary.totalNormal} normal)
      </p>
      {summary.setCodes.length ? (
        <p className="ds-meta">
          Sets:{' '}
          {summary.setCodes.map((code) => (
            <span key={code} className="ds-set-chip">
              {code}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function RulesDebugPanel({
  run,
  setScope,
  rulesDebug,
}: {
  run: GenerationRun;
  setScope: SetScope | null;
  rulesDebug: boolean;
}) {
  const [filterText, setFilterText] = useState('');
  const [explainDeckId, setExplainDeckId] = useState(run.deckResults[0]?.deck.deck_id || '');
  const [explainCardName, setExplainCardName] = useState('');
  const [explainLines, setExplainLines] = useState<ReturnType<typeof explainCard> | null>(null);

  const rows = useMemo(() => collectDebugEntries(run, filterText), [run, filterText]);

  if (!rulesDebug) {
    return null;
  }

  function handleExplain() {
    const result = (run.deckResults || []).find((r) => r.deck.deck_id === explainDeckId);
    if (!result || !setScope) {
      setExplainLines([]);
      return;
    }
    setExplainLines(explainCard(result.deck, setScope, explainCardName));
  }

  return (
    <details className="ds-rules-debug">
      <summary>Debug trace ({rows.length})</summary>
      <div className="ds-rules-debug-body">
        <label className="ds-field">
          Filter card
          <input
            type="text"
            id="ds-debug-filter"
            placeholder="Card name…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </label>

        {run.deckResults.length ? (
          <div className="ds-rules-debug-explain">
            <label className="ds-field">
              Explain card
              <select
                id="ds-debug-explain-deck"
                value={explainDeckId}
                onChange={(e) => setExplainDeckId(e.target.value)}
              >
                {run.deckResults.map((result) => (
                  <option key={result.deck.deck_id} value={result.deck.deck_id}>
                    {result.deck.deck_name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                id="ds-debug-explain-card"
                placeholder="Card name…"
                value={explainCardName}
                onChange={(e) => setExplainCardName(e.target.value)}
              />
              <button type="button" className="ds-btn" id="ds-debug-explain-btn" onClick={handleExplain}>
                Explain
              </button>
            </label>
            <div id="ds-debug-explain-out" className="ds-rules-debug-explain-out">
              {explainLines !== null ? (
                explainLines.length ? (
                  <ul className="ds-rules-debug-list">
                    {explainLines.map((line, i) => (
                      <li
                        key={i}
                        className={
                          'ds-rules-debug-item ds-rules-debug-' + (line.outcome || 'info')
                        }
                      >
                        {formatReason(line)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ds-meta">No profile paths found for that card.</p>
                )
              ) : null}
            </div>
          </div>
        ) : null}

        <ul className="ds-rules-debug-list" id="ds-debug-trace">
          {rows.length ? (
            rows.map((row, i) => (
              <li
                key={i}
                className={'ds-rules-debug-item ds-rules-debug-' + (row.entry.outcome || 'info')}
              >
                <span className="ds-meta">{row.deckName}</span> {formatReason(row.entry)}
              </li>
            ))
          ) : (
            <li className="ds-meta">No trace entries — re-run Generate with debug enabled.</li>
          )}
        </ul>
      </div>
    </details>
  );
}

export function DeckSuggestResults({
  generationRun,
  setScope,
  summary,
  rulesDebug,
  acceptedIds,
  onAccept,
  onDismiss,
  onNextPage,
  remainingCount,
  wishlistText,
  wishlistEmpty,
}: {
  generationRun: GenerationRun;
  setScope: SetScope | null;
  summary: ReturnType<typeof import('./export').buildSummary>;
  rulesDebug: boolean;
  acceptedIds?: string[];
  onAccept?: (deckId: string, s: Suggestion) => void;
  onDismiss?: (id: string) => void;
  onNextPage?: () => void;
  remainingCount?: number;
  wishlistText?: string;
  wishlistEmpty?: boolean;
}) {
  const acceptedSet = useMemo(() => new Set(acceptedIds || []), [acceptedIds]);
  const withSuggestions: DeckResult[] = [];
  const withoutSuggestions: DeckResult[] = [];
  (generationRun.deckResults || []).forEach((result) => {
    if (deckResultHasSuggestions(result)) {
      withSuggestions.push(result);
    } else {
      withoutSuggestions.push(result);
    }
  });

  return (
    <>
      <h3>Results</h3>
      {summary ? <SummaryCard summary={summary} /> : null}
      {withSuggestions.map((result) => (
        <DeckResultBlock
          key={result.deck.deck_id}
          result={result}
          acceptedIds={acceptedSet}
          onAccept={onAccept}
          onDismiss={onDismiss}
        />
      ))}
      {withoutSuggestions.length ? (
        <details className="ds-no-suggestions">
          <summary>No suggestions ({withoutSuggestions.length})</summary>
          {withoutSuggestions.map((result) => (
            <DeckResultBlock key={result.deck.deck_id} result={result} compact />
          ))}
        </details>
      ) : null}
      <RulesDebugPanel run={generationRun} setScope={setScope} rulesDebug={rulesDebug} />
      <div className="ds-end-page">
        {wishlistEmpty ? (
          <p className="ds-meta">Wishlist export is empty — accept cards first.</p>
        ) : wishlistText ? (
          <label className="ds-field">
            Wishlist export (session accepts)
            <textarea readOnly rows={6} value={wishlistText} aria-label="Wishlist export" />
          </label>
        ) : null}
        {onNextPage && remainingCount ? (
          <button type="button" className="ds-btn ds-btn-primary" onClick={onNextPage}>
            Next page ({remainingCount} remaining)
          </button>
        ) : null}
      </div>
    </>
  );
}
