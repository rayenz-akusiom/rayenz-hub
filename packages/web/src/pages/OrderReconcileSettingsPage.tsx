import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_ORDER_RECONCILE_SETTINGS,
  type OrderReconcileSettingsPayload,
} from '@rayenz-hub/shared';
import {
  getHubApiConfig,
  loadOrderReconcileSettings,
  persistOrderReconcileSettings,
} from '../api/hub-api';

function merge(remote: OrderReconcileSettingsPayload | null): OrderReconcileSettingsPayload {
  return { ...DEFAULT_ORDER_RECONCILE_SETTINGS, ...(remote || {}) };
}

export function OrderReconcileSettingsPage() {
  const apiConfig = getHubApiConfig();
  const [settings, setSettings] = useState<OrderReconcileSettingsPayload>(() => merge(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { settings: remote, source } = await loadOrderReconcileSettings();
        if (!cancelled) {
          setSettings(merge(remote));
          setStatus(
            source === 'api'
              ? 'Loaded from API.'
              : source === 'local'
                ? 'Loaded from localStorage.'
                : 'Using empty defaults — set your Archidekt URLs below.',
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const dest = await persistOrderReconcileSettings(settings);
      setStatus(dest === 'api' ? 'Saved to API and localStorage.' : 'Saved to localStorage.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="hub-web-status">Loading settings…</p>;
  }

  return (
    <div className="hub-web-page hub-web-page--tab">
      <h2 className="hub-web-section-title">Order Reconcile</h2>
      <p className="hub-web-hint">Folder / staging deck preferences. Card parsing stays on the Order Reconcile page.</p>

      {!apiConfig.enabled && (
        <div className="hub-web-banner hub-web-banner--warn" role="status">
          Saves go to localStorage only until the Hub API is configured.
        </div>
      )}
      {error && (
        <div className="hub-web-banner hub-web-banner--error" role="alert">
          {error}
        </div>
      )}
      {status && (
        <div className="hub-web-banner hub-web-banner--ok" role="status">
          {status}
        </div>
      )}

      <form className="hub-web-form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Archidekt</legend>
          <label className="hub-web-field">
            Folder URL
            <input
              type="url"
              value={settings.folderUrl || ''}
              placeholder="https://archidekt.com/folders/…"
              onChange={(e) => setSettings((prev) => ({ ...prev, folderUrl: e.target.value }))}
            />
          </label>
          <label className="hub-web-field">
            Buy/trade staging deck URL
            <input
              type="url"
              value={settings.stagingDeckUrl || ''}
              placeholder="https://archidekt.com/decks/…"
              onChange={(e) => setSettings((prev) => ({ ...prev, stagingDeckUrl: e.target.value }))}
            />
          </label>
          <label className="hub-web-field">
            Deck registry source
            <select
              value={settings.registrySource || 'folder'}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  registrySource: e.target.value as 'folder' | 'urls',
                }))
              }
            >
              <option value="folder">Folder</option>
              <option value="urls">Custom URLs</option>
            </select>
          </label>
          <label className="hub-web-field">
            Custom deck URLs (one per line)
            <textarea
              rows={5}
              value={settings.customDeckUrls || ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, customDeckUrls: e.target.value }))}
            />
          </label>
        </fieldset>

        <div className="hub-web-actions">
          <button type="submit" className="hub-web-button" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
