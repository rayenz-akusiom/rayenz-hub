import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import { installHubCardPickerBridge } from '../cards/CardPicker';
import { getHubApiConfig } from '../api/hub-api-client';
import { hydrateHubOwnerFlag } from '../lib/hub-auth-client';
import { restoreHubAuthSession } from '../lib/hub-auth-session';
import { HubNav } from './HubNav';
import { isSettingsPath } from './routes';
import { useHubRoute } from './useHubRoute';
import type { SettingsTab } from '../SettingsShell';

function lazyNamed<TModule, TKey extends keyof TModule & string>(
  load: () => Promise<TModule>,
  key: TKey,
): ComponentType<TModule[TKey] extends ComponentType<infer P> ? P : never> {
  return lazy(async () => {
    const mod = await load();
    return { default: mod[key] as ComponentType<any> };
  });
}

const DailiesApp = lazyNamed(() => import('../dailies/DailiesApp'), 'DailiesApp');
const NeopetsMoreApp = lazyNamed(() => import('../neopets-more/NeopetsMoreApp'), 'NeopetsMoreApp');
const LegacyDeckBuilderRedirect = lazyNamed(
  () => import('../deck-builder/LegacyDeckBuilderRedirect'),
  'LegacyDeckBuilderRedirect',
);
const CommanderBuilderApp = lazyNamed(
  () => import('../deck-builder/commander/CommanderBuilderApp'),
  'CommanderBuilderApp',
);
const CollectionBuilderApp = lazyNamed(
  () => import('../deck-builder/collection/CollectionBuilderApp'),
  'CollectionBuilderApp',
);
const CubeBuilderApp = lazyNamed(() => import('../deck-builder/cube/CubeBuilderApp'), 'CubeBuilderApp');
const ProfileBuilderApp = lazyNamed(
  () => import('../profile-builder/ProfileBuilderApp'),
  'ProfileBuilderApp',
);
const DeckSuggestApp = lazyNamed(() => import('../deck-suggest/DeckSuggestApp'), 'DeckSuggestApp');
const OrderReconcileApp = lazyNamed(
  () => import('../order-reconcile/OrderReconcileApp'),
  'OrderReconcileApp',
);
const SwapQueueApp = lazyNamed(() => import('../swap-queue/SwapQueueApp'), 'SwapQueueApp');
const InviteRedeemPage = lazyNamed(() => import('../pages/InviteRedeemPage'), 'InviteRedeemPage');
const SettingsShell = lazyNamed(() => import('../SettingsShell'), 'SettingsShell');

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
  if (path === '/collection-builder') return <CollectionBuilderApp />;
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
            <Suspense fallback={<div className="hub-loading">Loading...</div>}>
              <AppOutlet path={path} />
            </Suspense>
          </div>
        </main>
      </div>
    </>
  );
}
