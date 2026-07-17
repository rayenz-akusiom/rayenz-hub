import { useEffect, useState } from 'react';
import type { DeckDocument } from '@rayenz-hub/shared';
import { ProfileSync } from '../../mtg/profile-sync';
import { readProfileForDeck } from '../../deck-suggest/data';
import type { DeckProfile } from '../../deck-suggest/types';

/** Candidate profile ids for a Hub deck (builder vs Suggest naming). */
export function profileLookupKeys(deck: Pick<DeckDocument, 'deckId' | 'archidektId'>): string[] {
  const keys: string[] = [];
  const push = (k: string | null | undefined) => {
    const s = String(k || '').trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  push(deck.deckId);
  if (deck.archidektId != null) {
    push(String(deck.archidektId));
    push(`deck-${deck.archidektId}`);
  }
  return keys;
}

export async function loadDeckProfile(
  deck: Pick<DeckDocument, 'deckId' | 'archidektId'>,
): Promise<DeckProfile | null> {
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
      (p.blocked_cards && p.blocked_cards.length),
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

export function DeckProfilePanel({ deck }: { deck: DeckDocument }) {
  const [profile, setProfile] = useState<DeckProfile | null | undefined>(undefined);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProfile(undefined);
    void loadDeckProfile(deck).then((p) => {
      if (!cancelled) setProfile(p);
    });
    void ProfileSync.isConnected().then((c) => {
      if (!cancelled) setConnected(c);
    });
    return () => {
      cancelled = true;
    };
  }, [deck.deckId, deck.archidektId]);

  async function onConnect() {
    setConnecting(true);
    try {
      await ProfileSync.connectProfilesDir();
      setConnected(await ProfileSync.isConnected());
      setProfile(await loadDeckProfile(deck));
    } catch {
      /* user cancelled */
    } finally {
      setConnecting(false);
    }
  }

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
        </div>
      ) : (
        <div className="db-profile-empty">
          <p className="db-muted">No profile linked for this deck.</p>
          {connected === false ? (
            <button
              type="button"
              className="db-btn"
              disabled={connecting}
              onClick={() => void onConnect()}
            >
              {connecting ? 'Connecting…' : 'Connect profiles folder'}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
