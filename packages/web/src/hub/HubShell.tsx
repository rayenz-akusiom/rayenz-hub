import { useEffect, useState } from 'react';
import { DailiesApp } from '../dailies/DailiesApp';
import { DeckBuilderApp } from '../deck-builder/DeckBuilderApp';
import { DeckReviewApp } from '../deck-review/DeckReviewApp';
import { DeckSuggestApp } from '../deck-suggest/DeckSuggestApp';
import { NeopetsMoreApp } from '../neopets-more/NeopetsMoreApp';
import { OrderReconcileApp } from '../order-reconcile/OrderReconcileApp';
import { SettingsShell, type SettingsTab } from '../SettingsShell';
import { installHubCardPickerBridge } from '../cards/CardPicker';
import { HubNav } from './HubNav';
import { isSettingsPath } from './routes';
import { useHubRoute } from './useHubRoute';

function settingsTabFromPath(path: string): SettingsTab {
  if (path.startsWith('/settings/deck-builder')) return 'deck-builder';
  if (path.startsWith('/settings/deck-suggest')) return 'deck-suggest';
  if (path.startsWith('/settings/order-reconcile')) return 'order-reconcile';
  return 'dailies';
}

function AppOutlet({ path }: { path: string }) {
  if (path === '/dailies') return <DailiesApp />;
  if (path === '/neopets-more') return <NeopetsMoreApp />;
  if (path === '/deck-builder') return <DeckBuilderApp />;
  if (path === '/deck-review') return <DeckReviewApp />;
  if (path === '/deck-suggest') return <DeckSuggestApp />;
  if (path === '/order-reconcile') return <OrderReconcileApp />;
  if (isSettingsPath(path)) {
    return <SettingsShell tab={settingsTabFromPath(path)} />;
  }
  return <DailiesApp />;
}

export function HubShell() {
  const { path } = useHubRoute();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    installHubCardPickerBridge();
  }, []);

  return (
    <>
      <button
        type="button"
        id="hub-nav-toggle"
        className="hub-nav-toggle"
        aria-label="Open menu"
        onClick={() => setNavOpen((o) => !o)}
      >
        &#9776;
      </button>
      <div
        id="hub-nav-backdrop"
        className={`hub-nav-backdrop${navOpen ? ' open' : ''}`}
        onClick={() => setNavOpen(false)}
      />
      <div className="hub-layout">
        <HubNav path={path} open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="hub-main">
          <div id="app-root">
            <AppOutlet path={path} />
          </div>
        </main>
      </div>
    </>
  );
}
