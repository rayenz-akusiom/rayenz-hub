import { useCallback, useEffect, useState } from 'react';
import { DailiesSettingsPage } from './pages/DailiesSettingsPage';
import { DeckSuggestSettingsPage } from './pages/DeckSuggestSettingsPage';
import { OrderReconcileSettingsPage } from './pages/OrderReconcileSettingsPage';
import { setParentHash } from './lib/hub-storage';

export type SettingsTab = 'dailies' | 'deck-suggest' | 'order-reconcile';

const TABS: { id: SettingsTab; label: string; path: string }[] = [
  { id: 'dailies', label: 'Dailies', path: '/settings/dailies' },
  { id: 'deck-suggest', label: 'Deck Suggest', path: '/settings/deck-suggest' },
  { id: 'order-reconcile', label: 'Order Reconcile', path: '/settings/order-reconcile' },
];

function tabFromSearch(): SettingsTab {
  try {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'deck-suggest' || tab === 'order-reconcile' || tab === 'dailies') {
      return tab;
    }
  } catch {
    /* ignore */
  }
  return 'dailies';
}

export function SettingsShell() {
  const [tab, setTab] = useState<SettingsTab>(tabFromSearch);

  useEffect(() => {
    setTab(tabFromSearch());
  }, []);

  const selectTab = useCallback((next: SettingsTab) => {
    setTab(next);
    const meta = TABS.find((t) => t.id === next);
    if (meta) {
      setParentHash(meta.path);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  return (
    <div className="hub-web-shell">
      <header className="hub-web-header">
        <h1>Settings</h1>
        <p className="hub-web-lead">Per-app preferences. Saved to localStorage; synced to the Hub API when configured.</p>
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
        {tab === 'dailies' && <DailiesSettingsPage />}
        {tab === 'deck-suggest' && <DeckSuggestSettingsPage />}
        {tab === 'order-reconcile' && <OrderReconcileSettingsPage />}
      </div>
    </div>
  );
}
