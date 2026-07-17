import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  DEFAULT_DAILIES_SCHOOLS,
  DEFAULT_DAILIES_SETTINGS,
  DEFAULT_DAILIES_WISHLISTS,
  type DailiesSettingsPayload,
  type DailiesWishlist,
} from '@rayenz-hub/shared';
import { getHubApiConfig, loadDailiesSettings, persistDailiesSettings } from '../api/hub-api';
import { parsePetImageSlug } from '../lib/pet-image-slug';

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

function parseItemDbListUrl(url: string): { user: string; slug: string } | null {
  const match = String(url || '')
    .trim()
    .match(/itemdb\.com\.br\/lists\/([^/?#]+)\/([^/?#]+)/i);
  if (!match) {
    return null;
  }
  return {
    user: decodeURIComponent(match[1]),
    slug: decodeURIComponent(match[2]),
  };
}

function normalizeWishlist(entry: Partial<DailiesWishlist>, index: number): DailiesWishlist {
  const parsed = parseItemDbListUrl(entry.listUrl || '');
  const slug = entry.slug || parsed?.slug || '';
  const user = entry.user || parsed?.user || 'rayenz';
  const listUrl =
    entry.listUrl ||
    (slug
      ? `https://itemdb.com.br/lists/${encodeURIComponent(user)}/${encodeURIComponent(slug)}`
      : '');
  return {
    id: entry.id || slug || `wishlist-${index}`,
    label: String(entry.label || slug || 'Wishlist').trim(),
    listUrl,
    slug,
    user,
    img: entry.img || '',
  };
}

function mergeSettings(remote: DailiesSettingsPayload | null): DailiesSettingsPayload {
  const wishlists =
    remote?.wishlists && remote.wishlists.length > 0
      ? remote.wishlists.map((w, i) => normalizeWishlist(w, i))
      : DEFAULT_DAILIES_WISHLISTS.map((w, i) => normalizeWishlist(w, i));
  return {
    ...DEFAULT_DAILIES_SETTINGS,
    ...(remote || {}),
    mainPetName: remote?.mainPetName || '',
    mainPetSlug: remote?.mainPetSlug || '',
    schools: {
      ...DEFAULT_DAILIES_SCHOOLS,
      ...(remote?.schools || {}),
    },
    wishlists,
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
      const wishlists = (settings.wishlists || []).map((w, i) => normalizeWishlist(w, i));
      const payload: DailiesSettingsPayload = {
        ...settings,
        mainPetName: petName,
        mainPetSlug: settings.mainPetSlug || undefined,
        wishlists,
      };
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

  function updateWishlist(index: number, patch: Partial<DailiesWishlist>) {
    setSettings((prev) => {
      const list = [...(prev.wishlists || [])];
      list[index] = normalizeWishlist({ ...list[index], ...patch }, index);
      return { ...prev, wishlists: list };
    });
  }

  function moveWishlist(index: number, delta: number) {
    setSettings((prev) => {
      const list = [...(prev.wishlists || [])];
      const next = index + delta;
      if (next < 0 || next >= list.length) {
        return prev;
      }
      const tmp = list[index];
      list[index] = list[next];
      list[next] = tmp;
      return { ...prev, wishlists: list };
    });
  }

  function removeWishlist(index: number) {
    setSettings((prev) => ({
      ...prev,
      wishlists: (prev.wishlists || []).filter((_, i) => i !== index),
    }));
  }

  function addWishlist() {
    setSettings((prev) => ({
      ...prev,
      wishlists: [
        ...(prev.wishlists || []),
        normalizeWishlist({ label: 'New wishlist', listUrl: '', img: '' }, (prev.wishlists || []).length),
      ],
    }));
  }

  function resetWishlists() {
    setSettings((prev) => ({
      ...prev,
      wishlists: DEFAULT_DAILIES_WISHLISTS.map((w, i) => normalizeWishlist(w, i)),
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
          <legend>Wishlists</legend>
          <div className="hub-web-wishlist-actions">
            <button type="button" className="hub-web-button hub-web-button--secondary" onClick={addWishlist}>
              Add wishlist
            </button>
            <button type="button" className="hub-web-button hub-web-button--secondary" onClick={resetWishlists}>
              Reset defaults
            </button>
          </div>
          {(settings.wishlists || []).map((w, index) => (
            <div key={w.id || index} className="hub-web-wishlist-row">
              <label className="hub-web-field">
                Label
                <input
                  type="text"
                  value={w.label}
                  onChange={(e) => updateWishlist(index, { label: e.target.value })}
                />
              </label>
              <label className="hub-web-field">
                ItemDB list URL
                <input
                  type="url"
                  value={w.listUrl}
                  onChange={(e) => updateWishlist(index, { listUrl: e.target.value })}
                />
              </label>
              <label className="hub-web-field">
                Icon URL
                <input
                  type="url"
                  value={w.img || ''}
                  onChange={(e) => updateWishlist(index, { img: e.target.value })}
                />
              </label>
              <div className="hub-web-wishlist-row-actions">
                <button type="button" className="hub-web-button hub-web-button--secondary" onClick={() => moveWishlist(index, -1)}>
                  Up
                </button>
                <button type="button" className="hub-web-button hub-web-button--secondary" onClick={() => moveWishlist(index, 1)}>
                  Down
                </button>
                <button type="button" className="hub-web-button hub-web-button--secondary" onClick={() => removeWishlist(index)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
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
