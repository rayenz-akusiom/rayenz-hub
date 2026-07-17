import { parseInputToAcquired, updateAcquiredField } from './input';
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
}: OrderReconcileInputProps) {
  const settingsSummary = state.settings.folderUrl
    ? state.settings.folderUrl
    : '(no folder URL — configure in Settings)';

  function handleParse() {
    const cards = parseInputToAcquired(state.inputMode, listText, emailText);
    onAcquiredCardsChange(cards);
    onParse();
  }

  return (
    <>
      <div className="or-settings-panel">
        <h3>Settings</h3>
        <p className="or-meta">Folder: {settingsSummary}</p>
        <p>
          <a className="or-btn or-btn-ghost" href="#/settings/order-reconcile">
            Open Order Reconcile settings
          </a>
        </p>
      </div>
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
      </div>
      {state.inputMode === 'list' ? (
        <textarea
          className="or-textarea"
          placeholder={'1x Sol Ring (cmm) 1\n2 Lightning Bolt'}
          value={listText}
          onChange={(e) => onListTextChange(e.target.value)}
        />
      ) : (
        <textarea
          className="or-textarea"
          placeholder="Paste order confirmation email body…"
          value={emailText}
          onChange={(e) => onEmailTextChange(e.target.value)}
        />
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
        <button type="button" className="or-btn or-btn-ghost" onClick={handleParse}>
          Parse cards
        </button>{' '}
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
