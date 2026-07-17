import { useMemo, useState } from 'react';
import { explainCard, formatReason } from './debug';
import { collectDebugEntries } from './export';
import type { DeckResult, GenerationRun, SetScope } from './types';

function deckResultHasSuggestions(result: DeckResult): boolean {
  return !result.error && !result.skipped && (result.suggestions || []).length > 0;
}

function SuggestionLine({ s }: { s: NonNullable<DeckResult['suggestions']>[0] }) {
  const rep = s.replaces && s.replaces[0];
  return (
    <div className="ds-suggestion">
      <span className={'ds-tier ds-tier-' + (s.priority_tier || 'normal')}>
        {s.priority_tier || 'normal'}
      </span>{' '}
      <strong>{s.card.name}</strong>
      {rep && rep.name ? <> → cut {rep.name}</> : null}
      <br />
      <span className="ds-meta">{s.rationale || ''}</span>
    </div>
  );
}

function DeckResultBlock({ result, compact }: { result: DeckResult; compact?: boolean }) {
  return (
    <div className={'ds-deck-result' + (compact ? ' ds-deck-result-compact' : '')}>
      <h4>{result.deck.deck_name}</h4>
      {result.error ? (
        <p className="ds-error-inline">{result.error}</p>
      ) : result.skipped ? (
        <p className="ds-meta">{result.message || result.skip_reason}</p>
      ) : !(result.suggestions || []).length ? (
        <p className="ds-meta">No suggestions matched deck profile.</p>
      ) : (
        !compact &&
        (result.suggestions || []).map((s) => <SuggestionLine key={s.suggestion_id} s={s} />)
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
    poolSize: number;
    skippedQueueSlots: number;
  };
}) {
  return (
    <div className="ds-summary">
      <h4>Summary</h4>
      <p className="ds-summary-total">
        <strong>{summary.totalSuggestions}</strong> suggestions ({summary.totalSwap} swap ·{' '}
        {summary.totalNormal} normal)
      </p>
      <p className="ds-meta">
        Set {summary.setCodes.join(', ')} · {summary.poolSize} cards in pool
      </p>
      {summary.skippedQueueSlots > 0 ? (
        <p className="ds-meta">
          Queue slots skipped (not in set scope): {summary.skippedQueueSlots}
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
}: {
  generationRun: GenerationRun;
  setScope: SetScope | null;
  summary: ReturnType<typeof import('./export').buildSummary>;
  rulesDebug: boolean;
}) {
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
        <DeckResultBlock key={result.deck.deck_id} result={result} />
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
    </>
  );
}