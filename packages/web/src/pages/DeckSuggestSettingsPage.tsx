import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_DECK_SUGGEST_SETTINGS,
  type DeckSuggestSettingsPayload,
} from '@rayenz-hub/shared';
import { getHubApiConfig, loadDeckSuggestSettings, persistDeckSuggestSettings } from '../api/hub-api';
import { listReleaseOptions } from '../deck-suggest/releases';
import { ReleaseSelectOptgroups } from '../deck-suggest/ReleaseSelectOptgroups';

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
  const releases = listReleaseOptions();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { settings: remote, source } = await loadDeckSuggestSettings();
        if (!cancelled) {
          setSettings(merge(remote));
          setStatus(source === 'api' ? 'Loaded from API.' : 'Using defaults.');
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
      await persistDeckSuggestSettings(settings);
      setStatus('Saved.');
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
        Defaults for the Suggest page. Generate still runs from Deck Suggest.
      </p>

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
          <legend>Release defaults</legend>
          <label className="hub-web-field">
            Default input mode
            <select
              value={settings.setInputMode || 'release'}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  setInputMode: e.target.value as 'release' | 'codes',
                }))
              }
            >
              <option value="release">Set release</option>
              <option value="codes">Set codes</option>
            </select>
          </label>
          <label className="hub-web-field">
            Default set release
            <select
              value={settings.releaseId || ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, releaseId: e.target.value }))}
            >
              <option value="">(none)</option>
              <ReleaseSelectOptgroups releases={releases} />
            </select>
          </label>
          <label className="hub-web-field">
            Default set codes (up to 5)
            <input
              type="text"
              value={settings.setCodes || ''}
              placeholder="LTR, LTC"
              onChange={(e) => setSettings((prev) => ({ ...prev, setCodes: e.target.value }))}
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

        <div className="hub-web-actions">
          <button type="submit" className="hub-web-button" disabled={saving || !apiConfig.enabled}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
