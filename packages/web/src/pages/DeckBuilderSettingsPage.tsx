import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_DECK_BUILDER_SETTINGS,
  type DeckBuilderSettingsPayload,
} from '@rayenz-hub/shared';
import { getHubApiConfig, loadDeckBuilderSettings, persistDeckBuilderSettings } from '../api/hub-api';

function merge(remote: DeckBuilderSettingsPayload | null): DeckBuilderSettingsPayload {
  return { ...DEFAULT_DECK_BUILDER_SETTINGS, ...(remote || {}) };
}

export function DeckBuilderSettingsPage() {
  const apiConfig = getHubApiConfig();
  const [settings, setSettings] = useState<DeckBuilderSettingsPayload>(() => merge(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { settings: remote, source } = await loadDeckBuilderSettings();
        if (!cancelled) {
          setSettings(merge(remote));
          setStatus(
            source === 'api'
              ? 'Loaded from API.'
              : source === 'local'
                ? 'Loaded from localStorage.'
                : 'Using defaults.',
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
      const dest = await persistDeckBuilderSettings(settings);
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
      <h2 className="hub-web-section-title">Deck Builder</h2>
      <p className="hub-web-hint">
        Preferences for colour-identity browse labels. Guilds, X-less, and Prismatic are fixed; only
        three-colour names change.
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
          <legend>Colour identity names</legend>
          <label className="hub-web-field">
            Ally three-colour names
            <select
              value={settings.allyThreeColourNames}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  allyThreeColourNames: e.target.value as DeckBuilderSettingsPayload['allyThreeColourNames'],
                }))
              }
            >
              <option value="shards">Shards (Bant, Esper, Grixis, Jund, Naya)</option>
              <option value="capenna">Capenna gangs (Brokers, Obscura, Maestros, Riveteers, Cabaretti)</option>
            </select>
          </label>
          <label className="hub-web-field">
            Enemy three-colour names
            <select
              value={settings.enemyThreeColourNames}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  enemyThreeColourNames: e.target
                    .value as DeckBuilderSettingsPayload['enemyThreeColourNames'],
                }))
              }
            >
              <option value="wedges">Wedges (Abzan, Jeskai, Sultai, Mardu, Temur)</option>
              <option value="ikoria">Ikoria triomes (Indatha, Raugrin, Zagoth, Savai, Ketria)</option>
            </select>
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
