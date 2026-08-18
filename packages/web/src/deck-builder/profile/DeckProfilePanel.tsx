import { useEffect, useState } from 'react';
import { parseYamlProfile, profileLookupKeys, type DeckDocument } from '@rayenz-hub/shared';
import { pullPublicProfileYaml } from '../../api/hub-api-client';
import { readProfileForDeck } from '../../deck-suggest/data';
import type { DeckProfile } from '../../deck-suggest/types';
import { isLocalLibrarySlug, parseBuilderRoute } from '../../hub/routes';

export async function loadDeckProfile(
  deck: Pick<DeckDocument, 'deckId' | 'archidektId'>,
): Promise<DeckProfile | null> {
  const route = parseBuilderRoute();
  if (route && !isLocalLibrarySlug(route.userSlug)) {
    try {
      const yaml = await pullPublicProfileYaml(route.userSlug, route.deckSlug);
      if (!yaml) return null;
      const profile = parseYamlProfile(yaml);
      return hasProfileContent(profile) ? profile : null;
    } catch {
      return null;
    }
  }
  for (const key of profileLookupKeys(deck)) {
    const profile = await readProfileForDeck(key);
    if (profile && hasProfileContent(profile)) return profile;
  }
  return null;
}

function hasProfileContent(p: DeckProfile): boolean {
  return Boolean(
    p.format ||
      (p.tags && p.tags.length) ||
      (p.roles && p.roles.length) ||
      (p.protected_cards && p.protected_cards.length) ||
      (p.blocked_cards && p.blocked_cards.length) ||
      (p.themes && p.themes.length) ||
      (p.typal_types && p.typal_types.length) ||
      (p.keyword_interests && p.keyword_interests.length) ||
      (p.art_tags && p.art_tags.length),
  );
}

function CardNameList({ title, names }: { title: string; names: string[] }) {
  const [open, setOpen] = useState(false);
  if (!names.length) return null;
  return (
    <div className="db-profile-list">
      <button
        type="button"
        className="db-profile-list-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {title} ({names.length})
      </button>
      {open ? (
        <ul className="db-profile-names">
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DeckProfilePanel({ deck }: { deck: Pick<DeckDocument, 'deckId' | 'archidektId'> }) {
  const [profile, setProfile] = useState<DeckProfile | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setProfile(undefined);
    void loadDeckProfile(deck)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [deck.deckId, deck.archidektId]);

  return (
    <section className="db-profile" aria-label="Deck profile">
      <h3 className="db-profile-title">Profile</h3>
      {profile === undefined ? (
        <p className="db-muted">Loading profile…</p>
      ) : profile && hasProfileContent(profile) ? (
        <div className="db-profile-body">
          {profile.format ? (
            <p className="db-profile-meta">
              <span className="db-profile-label">Format</span> {profile.format}
            </p>
          ) : null}
          {profile.tags?.length ? (
            <p className="db-profile-meta">
              <span className="db-profile-label">Tags</span> {profile.tags.join(', ')}
            </p>
          ) : null}
          {profile.roles?.length ? (
            <div className="db-profile-roles">
              <span className="db-profile-label">Roles</span>
              <ul>
                {profile.roles.map((r) => (
                  <li key={r.id}>
                    <strong>{r.id}</strong>
                    {r.priority ? ` · ${r.priority}` : ''}
                    {r.tags?.length ? (
                      <span className="db-muted"> — {r.tags.join(', ')}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <CardNameList title="Protected" names={profile.protected_cards || []} />
          <CardNameList title="Blocked" names={profile.blocked_cards || []} />
          <CardNameList title="Themes" names={profile.themes || []} />
          <CardNameList title="Types" names={profile.typal_types || []} />
          <CardNameList title="Keywords" names={profile.keyword_interests || []} />
          <CardNameList title="Art tags" names={profile.art_tags || []} />
        </div>
      ) : (
        <div className="db-profile-empty">
          <p className="db-muted">No profile linked for this deck.</p>
        </div>
      )}
    </section>
  );
}
