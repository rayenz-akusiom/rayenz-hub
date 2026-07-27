import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  DEFAULT_DAILIES_SCHOOLS,
  DEFAULT_DAILIES_SETTINGS,
  OFFICIAL_DAILIES_LISTS,
  migrateTrackingLists,
  resolveOfficialWishlists,
  type DailiesSettingsPayload,
} from '@rayenz-hub/shared';
import { getHubApiConfig, loadDailiesSettings, persistDailiesSettings } from '../api/hub-api';
import { parsePetImageSlug } from '../lib/pet-image-slug';
import { stripSettingsForPersist, updateTrackingOverlay } from '../dailies/settings';

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
  const trackingLists = migrateTrackingLists(remote);
  return {
    ...DEFAULT_DAILIES_SETTINGS,
    ...(remote || {}),
    mainPetName: remote?.mainPetName || '',
    mainPetSlug: remote?.mainPetSlug || '',
    schools: {
      ...DEFAULT_DAILIES_SCHOOLS,
      ...(remote?.schools || {}),
    },
    trackingLists,
    wishlists: undefined,
  };
}

function normalizePetName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '_');
}

export function DailiesSettingsPage() {
  const apiConfig = getHubApiConfig();
  const [settings, setSettings] = useState<DailiesSettingsPayload>(() => mergeSettings(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [petLookupStatus, setPetLookupStatus] = useState<string | null>(null);
  const committedPetRef = useRef({ name: '', slug: '' });

  const trackingRows = resolveOfficialWishlists(settings);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { settings: remote, source } = await loadDailiesSettings();
        if (!cancelled) {
          const merged = mergeSettings(remote);
          setSettings(merged);
          committedPetRef.current = {
            name: normalizePetName(merged.mainPetName || ''),
            slug: merged.mainPetSlug || '',
          };
          if (source === 'api') {
            setStatus('Loaded from API (mirrored to localStorage).');
          } else if (source === 'local') {
            setStatus('Loaded from localStorage.');
          } else {
            setStatus('No saved settings yet — using defaults. Choose a main pet below.');
          }
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

  async function lookupPetSlug(petName: string, previousSlug: string, nameChanged: boolean) {
    const normalized = normalizePetName(petName);
    if (!normalized) {
      return;
    }
    setPetLookupStatus('Looking up pet image…');
    try {
      const bridge = window as Window & {
        __neopetsFetch?: (url: string) => Promise<string | { text: string }>;
      };
      if (typeof bridge.__neopetsFetch !== 'function') {
        setPetLookupStatus('Pet name saved. Image slug needs the userscript bridge (optional).');
        return;
      }
      const response = await bridge.__neopetsFetch(
        `https://www.neopets.com/petlookup.phtml?pet=${encodeURIComponent(normalized)}`,
      );
      const html = typeof response === 'string' ? response : response.text;
      const slug = parsePetImageSlug(html, { previousSlug, nameChanged });
      if (slug) {
        setSettings((prev) => ({ ...prev, mainPetSlug: slug }));
        committedPetRef.current = { name: normalized, slug };
        setPetLookupStatus('Pet image slug found.');
      } else {
        setSettings((prev) => ({ ...prev, mainPetSlug: '' }));
        committedPetRef.current = { name: normalized, slug: '' };
        setPetLookupStatus('Pet page loaded but no image slug found — cpn URL will be used.');
      }
    } catch {
      setPetLookupStatus('Could not look up pet (userscript bridge unavailable).');
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const petName = normalizePetName(settings.mainPetName || '');
    if (!petName) {
      setError('Choose a main pet name before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const payload = stripSettingsForPersist({
        ...settings,
        mainPetName: petName,
        mainPetSlug: settings.mainPetSlug || undefined,
      });
      const dest = await persistDailiesSettings(payload);
      setSettings(payload);
      committedPetRef.current = {
        name: petName,
        slug: payload.mainPetSlug || '',
      };
      setStatus(dest === 'api' ? 'Saved to API and localStorage.' : 'Saved to localStorage.');
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

  function setListEnabled(listId: string, enabled: boolean) {
    setSettings((prev) => updateTrackingOverlay(prev, listId, { enabled }));
  }

  function setListImg(listId: string, img: string) {
    setSettings((prev) => updateTrackingOverlay(prev, listId, { img }));
  }

  function resetTrackingDefaults() {
    setSettings((prev) => ({
      ...prev,
      trackingLists: {},
      wishlists: undefined,
    }));
  }

  if (loading) {
    return <p className="hub-web-status">Loading settings…</p>;
  }

  const petName = normalizePetName(settings.mainPetName || '');
  const petPreview = petName
    ? `https://pets.neopets.com/cpn/${encodeURIComponent(petName)}/1/4.png`
    : '';

  return (
    <div className="hub-web-page hub-web-page--tab">
      <h2 className="hub-web-section-title">Dailies</h2>

      {!apiConfig.enabled && (
        <div className="hub-web-banner hub-web-banner--warn" role="status">
          Hub API is not configured — saves go to localStorage only. Optionally set{' '}
          <code>rayenz-hub-api-url</code> and <code>rayenz-hub-api-key</code>.
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
          <legend>Main pet</legend>
          <p className="hub-web-hint">Required. There is no default pet — pick the Neopet you want highlighted.</p>
          <label className="hub-web-field">
            Pet name
            <input
              type="text"
              value={settings.mainPetName || ''}
              placeholder="Your_Pet_Name"
              onChange={(e) => setSettings((prev) => ({ ...prev, mainPetName: e.target.value }))}
              onBlur={() => {
                const n = normalizePetName(settings.mainPetName || '');
                if (!n) {
                  return;
                }
                const previousSlug = committedPetRef.current.slug || settings.mainPetSlug || '';
                const nameChanged = n !== committedPetRef.current.name;
                setSettings((prev) => ({
                  ...prev,
                  mainPetName: n,
                  mainPetSlug: nameChanged ? '' : prev.mainPetSlug,
                }));
                void lookupPetSlug(n, previousSlug, nameChanged);
              }}
            />
          </label>
          {petPreview && (
            <div className="hub-web-pet-preview">
              <img src={petPreview} alt={petName || 'Pet preview'} width={80} height={80} />
            </div>
          )}
          {petLookupStatus && <p className="hub-web-hint">{petLookupStatus}</p>}
        </fieldset>

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

        <fieldset>
          <legend>Tracking lists</legend>
          <p className="hub-web-hint">
            Official ItemDB catalogs. Toggle cards on the Dailies page and optionally override the icon.
          </p>
          <div className="hub-web-wishlist-actions">
            <button
              type="button"
              className="hub-web-button hub-web-button--secondary"
              onClick={resetTrackingDefaults}
            >
              Reset icons &amp; enable all
            </button>
          </div>
          {trackingRows.map((row) => {
            const def = OFFICIAL_DAILIES_LISTS.find((d) => d.id === row.id);
            return (
              <div key={row.id} className="hub-web-wishlist-row">
                <label className="hub-web-check">
                  <input
                    type="checkbox"
                    checked={row.enabled !== false}
                    onChange={(e) => setListEnabled(row.id, e.target.checked)}
                  />
                  {row.label}
                </label>
                <p className="hub-web-hint">
                  <a href={row.listUrl} target="_blank" rel="noopener">
                    {row.listUrl}
                  </a>
                </p>
                <label className="hub-web-field">
                  Icon URL
                  <input
                    type="url"
                    value={row.img || ''}
                    placeholder={def?.defaultImg || ''}
                    onChange={(e) => setListImg(row.id, e.target.value)}
                  />
                </label>
              </div>
            );
          })}
        </fieldset>

        <div className="hub-web-actions">
          <button type="submit" className="hub-web-button" disabled={saving}>
            {saving ? 'Saving…' : apiConfig.enabled ? 'Save' : 'Save locally'}
          </button>
        </div>
      </form>
    </div>
  );
}
