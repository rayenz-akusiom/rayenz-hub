import { useCallback, useEffect, useState } from 'react';
import { DailiesSettingsPage } from './pages/DailiesSettingsPage';
import { DeckBuilderSettingsPage } from './pages/DeckBuilderSettingsPage';
import { DeckSuggestSettingsPage } from './pages/DeckSuggestSettingsPage';
import { HubApiSettingsPage } from './pages/HubApiSettingsPage';
import { HubInvitesPage } from './pages/HubInvitesPage';
import { SwapQueueSettingsPage } from './pages/SwapQueueSettingsPage';
import { navigateHub } from './lib/hub-storage';

export type SettingsTab =
  | 'hub-api'
  | 'dailies'
  | 'deck-builder'
  | 'deck-suggest'
  | 'swap-queue'
  | 'invites';

const TABS: { id: SettingsTab; label: string; path: string }[] = [
  { id: 'hub-api', label: 'Hub API', path: '/settings/hub-api' },
  { id: 'dailies', label: 'Dailies', path: '/settings/dailies' },
  { id: 'deck-builder', label: 'Deck builders', path: '/settings/deck-builder' },
  { id: 'deck-suggest', label: 'Deck Suggest', path: '/settings/deck-suggest' },
  { id: 'swap-queue', label: 'Swap Queue', path: '/settings/swap-queue' },
  { id: 'invites', label: 'Invites', path: '/settings/invites' },
];

function tabFromPathHint(hint?: SettingsTab): SettingsTab {
  if (
    hint === 'hub-api' ||
    hint === 'deck-builder' ||
    hint === 'deck-suggest' ||
    hint === 'swap-queue' ||
    hint === 'invites' ||
    hint === 'dailies'
  ) {
    return hint;
  }
  return 'dailies';
}

export function SettingsShell({ tab: tabProp }: { tab?: SettingsTab } = {}) {
  const [tab, setTab] = useState<SettingsTab>(() => tabFromPathHint(tabProp));

  useEffect(() => {
    if (tabProp) setTab(tabFromPathHint(tabProp));
  }, [tabProp]);

  const selectTab = useCallback((next: SettingsTab) => {
    setTab(next);
    const meta = TABS.find((t) => t.id === next);
    if (meta) {
      navigateHub(meta.path);
    }
  }, []);

  return (
    <div className="hub-web-shell">
      <header className="hub-web-header">
        <h1>Settings</h1>
        <p className="hub-web-lead">
          Per-app preferences. Saved to localStorage; synced to the Hub API when configured.
        </p>
      </header>

      <nav className="hub-web-tabs" aria-label="Settings sections">
        {TABS.map((t) => (
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
        {tab === 'hub-api' && <HubApiSettingsPage />}
        {tab === 'dailies' && <DailiesSettingsPage />}
        {tab === 'deck-builder' && <DeckBuilderSettingsPage />}
        {tab === 'deck-suggest' && <DeckSuggestSettingsPage />}
        {tab === 'swap-queue' && <SwapQueueSettingsPage />}
        {tab === 'invites' && <HubInvitesPage />}
      </div>
    </div>
  );
}
