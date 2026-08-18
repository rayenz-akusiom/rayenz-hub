import { useEffect, useState } from 'react';
import { getAccessToken } from '../lib/hub-auth-session';
import { getHubApiConfig } from '../api/hub-api-client';

type InviteRow = {
  inviteId: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  url?: string;
};

async function ownerFetch(path: string, method = 'GET'): Promise<Response> {
  const cfg = getHubApiConfig();
  const token = getAccessToken();
  if (!cfg.url || !token) {
    throw new Error('Sign in as Rayenz first.');
  }
  return fetch(`${cfg.url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
}

export function HubInvitesPage() {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await ownerFetch('/v1/invites');
    if (res.status === 403) {
      throw new Error('Only the owner can manage invites.');
    }
    if (!res.ok) {
      throw new Error(`Failed to list invites (${res.status}).`);
    }
    const body = (await res.json()) as { invites?: InviteRow[] };
    setInvites(body.invites || []);
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  async function createInvite() {
    setBusy(true);
    setError(null);
    try {
      const res = await ownerFetch('/v1/invites', 'POST');
      const text = await res.text();
      if (!res.ok) {
        throw new Error('Could not create invite.');
      }
      const created = JSON.parse(text) as { url?: string };
      if (created.url) {
        await navigator.clipboard.writeText(created.url);
        setStatus('Invite created and copied to clipboard.');
      } else {
        setStatus('Invite created.');
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setStatus('Invite link copied.');
  }

  async function revoke(inviteId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await ownerFetch(`/v1/invites/${encodeURIComponent(inviteId)}/revoke`, 'POST');
      if (!res.ok) {
        throw new Error('Could not revoke invite.');
      }
      setStatus('Invite revoked.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hub-web-page hub-web-page--tab">
      <h2 className="hub-web-section-title">Invites</h2>
      <p className="hub-web-hint">
        Owner-only. Create a single-use link (7 days). Share it yourself. Cognito emails the invitee a verification code; they sign in with username and password.
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
      <div className="hub-web-form-actions">
        <button type="button" className="hub-web-button" disabled={busy} onClick={() => void createInvite()}>
          Create invite
        </button>
      </div>
      <ul className="hub-web-list">
        {invites.map((invite) => (
          <li key={invite.inviteId}>
            <strong>{invite.status}</strong> · expires {invite.expiresAt}
            {invite.url && invite.status === 'unused' && (
              <button type="button" className="hub-web-button hub-web-button--secondary" onClick={() => void copyUrl(invite.url!)}>
                Copy link
              </button>
            )}
            {invite.status === 'unused' && (
              <button type="button" className="hub-web-button hub-web-button--secondary" onClick={() => void revoke(invite.inviteId)}>
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
