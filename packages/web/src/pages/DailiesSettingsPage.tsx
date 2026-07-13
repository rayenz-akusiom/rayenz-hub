import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_DAILIES_SCHOOLS,
  DEFAULT_DAILIES_SETTINGS,
  type DailiesSettingsPayload,
} from '@rayenz-hub/shared';
import { fetchDailiesSettings, getHubApiConfig, saveDailiesSettings } from '../api/hub-api';

const SCHOOL_LABELS: Record<string, string> = {
  swashbuckling: 'Swashbuckling Academy',
  'mystery-island': 'Mystery Island Training',
  'secret-ninja': 'Secret Ninja Training',
  'lab-ray': 'Lab Ray',
  'kitchen-quests': 'Kitchen Quests',
  'healing-springs': 'Healing Springs',
  battledome: 'Battledome',
  'faerie-quests': 'Faerie Quests',
};

function mergeSettings(remote: DailiesSettingsPayload | null): DailiesSettingsPayload {
  return {
    ...DEFAULT_DAILIES_SETTINGS,
    ...(remote || {}),
    schools: {
      ...DEFAULT_DAILIES_SCHOOLS,
      ...(remote?.schools || {}),
    },
  };
}

export function DailiesSettingsPage() {
  const apiConfig = getHubApiConfig();
  const [settings, setSettings] = useState<DailiesSettingsPayload>(() => mergeSettings(null));
  const [loading, setLoading] = useState(apiConfig.enabled);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiConfig.enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchDailiesSettings();
        if (!cancelled) {
          setSettings(mergeSettings(remote));
          setStatus(remote ? 'Loaded from API.' : 'No saved settings yet — using defaults.');
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
  }, [apiConfig.enabled]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await saveDailiesSettings(settings);
      setStatus('Settings saved to API.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function toggleSchool(schoolId: string) {
    setSettings((prev) => ({
      ...prev,
      schools: {
        ...DEFAULT_DAILIES_SCHOOLS,
        ...(prev.schools || {}),
        [schoolId]: !(prev.schools?.[schoolId] ?? true),
      },
    }));
  }

  if (loading) {
    return <p className="hub-web-status">Loading settings…</p>;
  }

  return (
    <div className="hub-web-page">
      <header className="hub-web-header">
        <h1>Dailies settings</h1>
        <p className="hub-web-lead">API-first settings editor (spec 002 Phase D).</p>
      </header>

      {!apiConfig.enabled && (
        <div className="hub-web-banner hub-web-banner--warn" role="status">
          Hub API is not configured. Set <code>rayenz-hub-api-url</code> and{' '}
          <code>rayenz-hub-api-key</code> in localStorage, then reload.
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
          <legend>Faerie quest</legend>
          <label className="hub-web-radio">
            <input
              type="radio"
              name="faerieQuest"
              value="illusen"
              checked={settings.faerieQuest === 'illusen'}
              onChange={() => setSettings((prev) => ({ ...prev, faerieQuest: 'illusen' }))}
            />
            Illusen
          </label>
          <label className="hub-web-radio">
            <input
              type="radio"
              name="faerieQuest"
              value="jhudora"
              checked={settings.faerieQuest === 'jhudora'}
              onChange={() => setSettings((prev) => ({ ...prev, faerieQuest: 'jhudora' }))}
            />
            Jhudora
          </label>
        </fieldset>

        <fieldset>
          <legend>Magma Pool</legend>
          <label className="hub-web-field">
            Local time (HH:MM)
            <input
              type="text"
              value={settings.magmaPoolLocalTime || ''}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, magmaPoolLocalTime: e.target.value }))
              }
            />
          </label>
          <label className="hub-web-field">
            Buffer (minutes)
            <input
              type="number"
              min={0}
              value={settings.magmaPoolBufferMinutes ?? 15}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  magmaPoolBufferMinutes: Number(e.target.value),
                }))
              }
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Training &amp; activities</legend>
          <div className="hub-web-checkgrid">
            {Object.entries(SCHOOL_LABELS).map(([id, label]) => (
              <label key={id} className="hub-web-check">
                <input
                  type="checkbox"
                  checked={settings.schools?.[id] ?? true}
                  onChange={() => toggleSchool(id)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="hub-web-actions">
          <button type="submit" className="hub-web-button" disabled={!apiConfig.enabled || saving}>
            {saving ? 'Saving…' : 'Save to API'}
          </button>
        </div>
      </form>
    </div>
  );
}
