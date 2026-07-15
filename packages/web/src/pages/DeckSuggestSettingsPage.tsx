import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_DECK_SUGGEST_SETTINGS,
  type DeckSuggestSettingsPayload,
} from '@rayenz-hub/shared';
import { getHubApiConfig, loadDeckSuggestSettings, persistDeckSuggestSettings } from '../api/hub-api';

function merge(remote: DeckSuggestSettingsPayload | null): DeckSuggestSettingsPayload {
  return { ...DEFAULT_DECK_SUGGEST_SETTINGS, ...(remote || {}) };
}

export function DeckSuggestSettingsPage() {
  const apiConfig = getHubApiConfig();
  const [settings, setSettings] = useState<DeckSuggestSettingsPayload>(() => merge(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { settings: remote, source } = await loadDeckSuggestSettings();
        if (!cancelled) {
          setSettings(merge(remote));
          setStatus(
            source === 'api'
              ? 'Loaded from API.'
              : source === 'local'
                ? 'Loaded from localStorage.'
                : 'Using empty defaults — set your Archidekt folder and set codes.',
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
      const dest = await persistDeckSuggestSettings(settings);
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
      <h2 className="hub-web-section-title">Deck Suggest</h2>
      <p className="hub-web-hint">
        Preference fields used by Deck Suggest. Load / generate actions stay on the Deck Suggest page.
      </p>

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
          <legend>Set pool &amp; folder</legend>
          <label className="hub-web-field">
            Set codes (comma-separated)
            <input
              type="text"
              value={settings.setCodes || ''}
              placeholder="MSH,MSC,MAR"
              onChange={(e) => setSettings((prev) => ({ ...prev, setCodes: e.target.value }))}
            />
          </label>
          <label className="hub-web-field">
            Archidekt folder URL
            <input
              type="url"
              value={settings.folderUrl || ''}
              placeholder="https://archidekt.com/folders/…"
              onChange={(e) => setSettings((prev) => ({ ...prev, folderUrl: e.target.value }))}
            />
          </label>
          <label className="hub-web-check">
            <input
              type="checkbox"
              checked={!!settings.rulesDebug}
              onChange={(e) => setSettings((prev) => ({ ...prev, rulesDebug: e.target.checked }))}
            />
            Debug trace (local)
          </label>
        </fieldset>

        <fieldset>
          <legend>Deck load preferences</legend>
          <label className="hub-web-field">
            Default decks tab
            <select
              value={settings.deckLoadTab || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  deckLoadTab: (e.target.value || null) as DeckSuggestSettingsPayload['deckLoadTab'],
                }))
              }
            >
              <option value="">(none)</option>
              <option value="folder">Folder</option>
              <option value="paste-import">Paste deck</option>
              <option value="paste-urls">Paste URLs</option>
              <option value="upload">Upload JSON</option>
            </select>
          </label>
          <label className="hub-web-field">
            Paste deck name
            <input
              type="text"
              value={settings.pasteDeckName || ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, pasteDeckName: e.target.value }))}
            />
          </label>
          <label className="hub-web-field">
            Paste deck URL
            <input
              type="url"
              value={settings.pasteDeckUrl || ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, pasteDeckUrl: e.target.value }))}
            />
          </label>
          <label className="hub-web-field">
            Archidekt import text
            <textarea
              rows={4}
              value={settings.pasteDeckImport || ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, pasteDeckImport: e.target.value }))}
            />
          </label>
          <label className="hub-web-field">
            Custom deck URLs (one per line)
            <textarea
              rows={4}
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
