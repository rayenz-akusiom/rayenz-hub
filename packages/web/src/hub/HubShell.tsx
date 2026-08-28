import { useEffect, useRef, useState } from 'react';
import { DailiesApp } from '../dailies/DailiesApp';
import { LegacyDeckBuilderRedirect } from '../deck-builder/LegacyDeckBuilderRedirect';
import { CommanderBuilderApp } from '../deck-builder/commander/CommanderBuilderApp';
import { CubeBuilderApp } from '../deck-builder/cube/CubeBuilderApp';
import { ProfileBuilderApp } from '../profile-builder/ProfileBuilderApp';
import { DeckSuggestApp } from '../deck-suggest/DeckSuggestApp';
import { NeopetsMoreApp } from '../neopets-more/NeopetsMoreApp';
import { OrderReconcileApp } from '../order-reconcile/OrderReconcileApp';
import { SwapQueueApp } from '../swap-queue/SwapQueueApp';
import { InviteRedeemPage } from '../pages/InviteRedeemPage';
import { SettingsShell, type SettingsTab } from '../SettingsShell';
import { installHubCardPickerBridge } from '../cards/CardPicker';
import { getHubApiConfig } from '../api/hub-api-client';
import { hydrateHubOwnerFlag } from '../lib/hub-auth-client';
import { restoreHubAuthSession } from '../lib/hub-auth-session';
import { HubNav } from './HubNav';
import { isSettingsPath } from './routes';
import { useHubRoute } from './useHubRoute';

function settingsTabFromPath(path: string): SettingsTab {
  if (path.startsWith('/settings/profile') || path.startsWith('/settings/hub-api')) {
    return 'profile';
  }
  if (
    path.startsWith('/settings/mtg') ||
    path.startsWith('/settings/deck-builder') ||
    path.startsWith('/settings/deck-suggest') ||
    path.startsWith('/settings/swap-queue') ||
    path.startsWith('/settings/order-reconcile')
  ) {
    return 'mtg';
  }
  if (path.startsWith('/settings/invites')) return 'invites';
  return 'dailies';
}

function AppOutlet({ path }: { path: string }) {
  if (path === '/dailies') return <DailiesApp />;
  if (path === '/neopets-more') return <NeopetsMoreApp />;
  if (path === '/commander-builder') return <CommanderBuilderApp />;
  if (path === '/cube-builder') return <CubeBuilderApp />;
  if (path === '/deck-builder') return <LegacyDeckBuilderRedirect />;
  if (path === '/profile-builder') return <ProfileBuilderApp />;
  if (path === '/deck-suggest' || path === '/deck-review') return <DeckSuggestApp />;
  if (path === '/order-reconcile') return <OrderReconcileApp />;
  if (path === '/swap-queue' || path.startsWith('/swap-queue/')) {
    return <SwapQueueApp entryPath="swap-queue" />;
  }
  if (path === '/wishlist' || path.startsWith('/wishlist/')) {
    return <SwapQueueApp entryPath="wishlist" />;
  }
  if (path === '/invite') return <InviteRedeemPage />;
  if (isSettingsPath(path)) {
    return <SettingsShell tab={settingsTabFromPath(path)} />;
  }
  return <DailiesApp />;
}

export function HubShell() {
  const { path } = useHubRoute();
  const [navOpen, setNavOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    installHubCardPickerBridge();
    void (async () => {
      const url = getHubApiConfig().url;
      if (url) await restoreHubAuthSession(url);
      await hydrateHubOwnerFlag();
    })();
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setNavOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <>
      <button
        type="button"
        id="hub-nav-toggle"
        ref={toggleRef}
        className="hub-nav-toggle"
        aria-label={navOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={navOpen}
        aria-controls="hub-nav"
        onClick={() => setNavOpen((o) => !o)}
      >
        &#9776;
      </button>
      <div
        id="hub-nav-backdrop"
        className={`hub-nav-backdrop${navOpen ? ' open' : ''}`}
        onClick={() => {
          setNavOpen(false);
          toggleRef.current?.focus();
        }}
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
