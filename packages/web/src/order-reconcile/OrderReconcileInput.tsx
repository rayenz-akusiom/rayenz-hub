import { useEffect, useState } from 'react';
import { PRECONS_USERNAME, toKebabCase, type DeckSummary } from '@rayenz-hub/shared';
import { apiGetPublicDeck, apiListPublicDecks } from '../deck-builder/store/deck-api';
import { parseInputToAcquired, updateAcquiredField } from './input';
import { mergeAcquiredWithPreconLands } from './precon-lands';
import type { InputMode, OrderReconcileState } from './types';

export type OrderReconcileInputProps = {
  state: OrderReconcileState;
  listText: string;
  emailText: string;
  onListTextChange: (text: string) => void;
  onEmailTextChange: (text: string) => void;
  onInputModeChange: (mode: InputMode) => void;
  onProxyOrderChange: (checked: boolean) => void;
  onAcquiredCardsChange: (cards: OrderReconcileState['acquiredCards']) => void;
  onParse: () => void;
  onContinue: () => void;
  onStatus?: (message: string) => void;
};

export function OrderReconcileInput({
  state,
  listText,
  emailText,
  onListTextChange,
  onEmailTextChange,
  onInputModeChange,
  onProxyOrderChange,
  onAcquiredCardsChange,
  onParse,
  onContinue,
  onStatus,
}: OrderReconcileInputProps) {
  const [preconSummaries, setPreconSummaries] = useState<DeckSummary[] | null>(null);
  const [preconListError, setPreconListError] = useState<string | null>(null);
  const [preconListLoading, setPreconListLoading] = useState(false);
  const [preconFilter, setPreconFilter] = useState('');
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<string>>(() => new Set());
  const [preconAddLoading, setPreconAddLoading] = useState(false);

  useEffect(() => {
    if (state.inputMode !== 'precon') return;
    if (preconSummaries != null) return;
    let cancelled = false;
    setPreconListLoading(true);
    setPreconListError(null);
    void (async () => {
      try {
        const payload = await apiListPublicDecks(PRECONS_USERNAME);
        if (cancelled) return;
        if (!payload) {
          setPreconListError('Could not load precon catalog. Is the Hub API available?');
          setPreconSummaries([]);
          return;
        }
        const decks = [...(payload.decks || [])].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        );
        setPreconSummaries(decks);
      } catch (err) {
        if (cancelled) return;
        setPreconListError(err instanceof Error ? err.message : 'Failed to load precons.');
        setPreconSummaries([]);
      } finally {
        if (!cancelled) setPreconListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.inputMode, preconSummaries]);

  function handleParse() {
    if (state.inputMode === 'precon') return;
    const cards = parseInputToAcquired(state.inputMode, listText, emailText);
    onAcquiredCardsChange(cards);
    onParse();
  }

  function toggleDeck(deckId: string) {
    setSelectedDeckIds((prev) => {
      const next = new Set(prev);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }

  async function handleAddPreconLands() {
    if (!preconSummaries?.length || selectedDeckIds.size === 0 || preconAddLoading) return;
    setPreconAddLoading(true);
    onStatus?.('Loading selected precons…');
    try {
      const selected = preconSummaries.filter((d) => selectedDeckIds.has(d.deckId));
      const docs = [];
      for (const summary of selected) {
        const doc = await apiGetPublicDeck(PRECONS_USERNAME, toKebabCase(summary.name));
        if (doc) docs.push(doc);
      }
      if (!docs.length) {
        onStatus?.('No precon decks could be loaded.');
        return;
      }
      const merged = mergeAcquiredWithPreconLands(state.acquiredCards, docs);
      onAcquiredCardsChange(merged);
      setSelectedDeckIds(new Set());
      onStatus?.(
        `Added non-basic lands from ${docs.length} precon${docs.length === 1 ? '' : 's'} (${merged.length} acquired rows).`,
      );
    } catch (err) {
      onStatus?.(err instanceof Error ? err.message : 'Failed to add precon lands.');
    } finally {
      setPreconAddLoading(false);
    }
  }

  const filterLower = preconFilter.trim().toLowerCase();
  const filteredSummaries =
    preconSummaries?.filter((d) => !filterLower || d.name.toLowerCase().includes(filterLower)) || [];

  return (
    <>
      <div className="or-input-tabs">
        <button
          type="button"
          className={'or-input-tab' + (state.inputMode === 'list' ? ' active' : '')}
          onClick={() => onInputModeChange('list')}
        >
          Card list
        </button>
        <button
          type="button"
          className={'or-input-tab' + (state.inputMode === 'email' ? ' active' : '')}
          onClick={() => onInputModeChange('email')}
        >
          Order email <span className="or-badge-experimental">experimental</span>
        </button>
        <button
          type="button"
          className={'or-input-tab' + (state.inputMode === 'precon' ? ' active' : '')}
          onClick={() => onInputModeChange('precon')}
        >
          Precons
        </button>
      </div>
      {state.inputMode === 'list' ? (
        <textarea
          className="or-textarea"
          placeholder={'1x Sol Ring (cmm) 1\n2 Lightning Bolt'}
          value={listText}
          onChange={(e) => onListTextChange(e.target.value)}
        />
      ) : state.inputMode === 'email' ? (
        <textarea
          className="or-textarea"
          placeholder="Paste order confirmation email body…"
          value={emailText}
          onChange={(e) => onEmailTextChange(e.target.value)}
        />
      ) : (
        <div className="or-precon-panel">
          <p className="or-precon-hint">
            Pick one or more precon decks to add their non-basic lands to the acquired list.
          </p>
          {preconListLoading && <p className="or-empty">Loading precon catalog…</p>}
          {preconListError && <p className="or-error">{preconListError}</p>}
          {!preconListLoading && preconSummaries != null && !preconListError && (
            <>
              <input
                type="search"
                className="or-precon-filter"
                placeholder="Filter precons…"
                value={preconFilter}
                onChange={(e) => setPreconFilter(e.target.value)}
                aria-label="Filter precons"
              />
              <div className="or-precon-list" role="listbox" aria-label="Precon decks" aria-multiselectable="true">
                {filteredSummaries.length === 0 ? (
                  <p className="or-empty">No precons match.</p>
                ) : (
                  filteredSummaries.map((deck) => {
                    const checked = selectedDeckIds.has(deck.deckId);
                    return (
                      <label key={deck.deckId} className={'or-precon-item' + (checked ? ' selected' : '')}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDeck(deck.deckId)}
                        />
                        <span>{deck.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="or-precon-selected-count">
                {selectedDeckIds.size} selected
                {preconSummaries.length ? ` of ${preconSummaries.length}` : ''}
              </p>
            </>
          )}
        </div>
      )}
      <div style={{ margin: '12px 0' }}>
        <label className="or-proxy-order-label">
          <input
            type="checkbox"
            checked={state.isProxyOrder}
            onChange={(e) => onProxyOrderChange(e.target.checked)}
          />{' '}
          Proxy order (tag added cards with Proxies category)
        </label>
      </div>
      <div style={{ margin: '12px 0' }}>
        {state.inputMode === 'precon' ? (
          <button
            type="button"
            className="or-btn or-btn-primary"
            disabled={selectedDeckIds.size === 0 || preconAddLoading}
            onClick={() => void handleAddPreconLands()}
          >
            {preconAddLoading ? 'Adding…' : 'Add non-basic lands'}
          </button>
        ) : (
          <button type="button" className="or-btn or-btn-ghost" onClick={handleParse}>
            Parse cards
          </button>
        )}{' '}
        <button type="button" className="or-btn or-btn-primary" onClick={onContinue}>
          Continue
        </button>
      </div>
      <div id="or-parsed-area">
        {!state.acquiredCards.length ? (
          <p className="or-empty">No cards parsed yet.</p>
        ) : (
          <table className="or-parsed-table">
            <thead>
              <tr>
                <th>Qty</th>
                <th>Name</th>
                <th>Set</th>
                <th>#</th>
                <th>Finish</th>
              </tr>
            </thead>
            <tbody>
              {state.acquiredCards.map((card, i) => (
                <tr key={card.id || i} data-acq-index={i}>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={card.quantity || 1}
                      onChange={(e) => onAcquiredCardsChange(updateAcquiredField(state.acquiredCards, i, 'quantity', e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={card.name}
                      onChange={(e) => onAcquiredCardsChange(updateAcquiredField(state.acquiredCards, i, 'name', e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={card.set_code || ''}
                      onChange={(e) => onAcquiredCardsChange(updateAcquiredField(state.acquiredCards, i, 'set_code', e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={card.collector_number || ''}
                      onChange={(e) =>
                        onAcquiredCardsChange(updateAcquiredField(state.acquiredCards, i, 'collector_number', e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={card.finish || ''}
                      onChange={(e) => onAcquiredCardsChange(updateAcquiredField(state.acquiredCards, i, 'finish', e.target.value))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
