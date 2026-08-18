import { useCallback, useEffect, useState } from 'react';
import { DailiesSettingsPage } from './pages/DailiesSettingsPage';
import { DeckBuilderSettingsPage } from './pages/DeckBuilderSettingsPage';
import { DeckSuggestSettingsPage } from './pages/DeckSuggestSettingsPage';
import { HubInvitesPage } from './pages/HubInvitesPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';
import { SwapQueueSettingsPage } from './pages/SwapQueueSettingsPage';
import { navigateHub } from './lib/hub-storage';
import {
  HUB_AUTH_CHANGED_EVENT,
  HUB_AUTH_REQUIRED_EVENT,
  isSignedIn,
} from './lib/hub-auth-session';

export type SettingsTab = 'profile' | 'dailies' | 'mtg' | 'invites';

const TABS: { id: SettingsTab; label: string; path: string; signedInOnly?: boolean }[] = [
  { id: 'profile', label: 'Profile', path: '/settings/profile' },
  { id: 'dailies', label: 'Dailies', path: '/settings/dailies' },
  { id: 'mtg', label: 'MTG', path: '/settings/mtg' },
  { id: 'invites', label: 'Invites', path: '/settings/invites', signedInOnly: true },
];

function tabFromPathHint(hint?: SettingsTab): SettingsTab {
  if (hint === 'profile' || hint === 'mtg' || hint === 'invites' || hint === 'dailies') {
    return hint;
  }
  return 'dailies';
}

function SignInRequired({ children }: { children: string }) {
  return (
    <p className="hub-web-hint" role="status">
      {children}
    </p>
  );
}

export function SettingsShell({ tab: tabProp }: { tab?: SettingsTab } = {}) {
  const [tab, setTab] = useState<SettingsTab>(() => tabFromPathHint(tabProp));
  const [signedIn, setSignedIn] = useState(() => isSignedIn());

  useEffect(() => {
    if (tabProp) setTab(tabFromPathHint(tabProp));
  }, [tabProp]);

  useEffect(() => {
    const sync = () => {
      const next = isSignedIn();
      setSignedIn(next);
      if (!next) {
        setTab((current) => {
          if (current !== 'invites') return current;
          navigateHub('/settings/profile');
          return 'profile';
        });
      }
    };
    window.addEventListener(HUB_AUTH_CHANGED_EVENT, sync);
    window.addEventListener(HUB_AUTH_REQUIRED_EVENT, sync);
    return () => {
      window.removeEventListener(HUB_AUTH_CHANGED_EVENT, sync);
      window.removeEventListener(HUB_AUTH_REQUIRED_EVENT, sync);
    };
  }, []);

  const selectTab = useCallback((next: SettingsTab) => {
    setTab(next);
    const meta = TABS.find((t) => t.id === next);
    if (meta) {
      navigateHub(meta.path);
    }
  }, []);

  const visibleTabs = TABS.filter((t) => !t.signedInOnly || signedIn);

  return (
    <div className="hub-web-shell">
      <header className="hub-web-header">
        <h1>Settings</h1>
        <p className="hub-web-lead">
          Per-app preferences. MTG settings require sign-in; Dailies can save locally.
        </p>
      </header>

      <nav className="hub-web-tabs" aria-label="Settings sections">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={'hub-web-tab' + (tab === t.id ? ' hub-web-tab--active' : '')}
            onClick={() => selectTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="hub-web-tab-panel">
        {tab === 'profile' && <ProfileSettingsPage />}
        {tab === 'dailies' && <DailiesSettingsPage />}
        {tab === 'mtg' &&
          (signedIn ? (
            <div className="hub-web-swimlanes">
              <section className="hub-web-swimlane">
                <DeckBuilderSettingsPage />
              </section>
              <section className="hub-web-swimlane">
                <DeckSuggestSettingsPage />
              </section>
              <section className="hub-web-swimlane">
                <SwapQueueSettingsPage />
              </section>
            </div>
          ) : (
            <SignInRequired>Sign in from the left nav to manage MTG app settings.</SignInRequired>
          ))}
        {tab === 'invites' &&
          (signedIn ? (
            <HubInvitesPage />
          ) : (
            <SignInRequired>Sign in from the left nav to manage invites.</SignInRequired>
          ))}
      </div>
    </div>
  );
}
