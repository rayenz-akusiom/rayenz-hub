import {
  CAD_FX_DISCLAIMER,
  useSwapQueuePricePrefs,
  type SwapQueueCurrency,
} from '../swap-queue/price-prefs';

export function SwapQueueSettingsPage() {
  const { currency, setCurrency, alwaysShowPrices, setAlwaysShowPrices } =
    useSwapQueuePricePrefs();

  return (
    <div className="hub-web-page hub-web-page--tab">
      <h2 className="hub-web-section-title">Swap Queue</h2>
      <p className="hub-web-hint">
        Device preferences for shopping filters and price display. Saved in this browser only.
      </p>

      <form
        className="hub-web-form"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <fieldset className="hub-web-fieldset">
          <legend>Price currency</legend>
          <p className="hub-web-hint">
            Default CAD. Min/Max filters and tile badges use this unit. Switching currency keeps
            the same numbers and reinterprets them.
          </p>
          <label className="hub-web-radio">
            <input
              type="radio"
              name="sq-settings-currency"
              checked={currency === 'CAD'}
              onChange={() => setCurrency('CAD')}
            />
            CAD (Bank of Canada FX on Scryfall USD)
          </label>
          <label className="hub-web-radio">
            <input
              type="radio"
              name="sq-settings-currency"
              checked={currency === 'USD'}
              onChange={() => setCurrency('USD')}
            />
            USD (Scryfall)
          </label>
          {currency === 'CAD' ? (
            <p className="hub-web-hint" role="note">
              {CAD_FX_DISCLAIMER}
            </p>
          ) : null}
        </fieldset>

        <label className="hub-web-check">
          <input
            type="checkbox"
            checked={alwaysShowPrices}
            onChange={(e) => setAlwaysShowPrices(e.target.checked)}
          />
          Always show prices on Swap Queue tiles
        </label>
        <p className="hub-web-hint">
          Off by default. Prices also appear when a Min or Max price filter is active.
        </p>
      </form>
    </div>
  );
}

export type { SwapQueueCurrency };
