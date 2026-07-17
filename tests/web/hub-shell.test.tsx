import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HubShell } from '../../packages/web/src/hub/HubShell';
import { HubNav } from '../../packages/web/src/hub/HubNav';
import * as useHubRouteModule from '../../packages/web/src/hub/useHubRoute';
import type { HubPath } from '../../packages/web/src/hub/routes';
import { installHubCardPickerBridge } from '../../packages/web/src/cards/CardPicker';

vi.mock('../../packages/web/src/dailies/DailiesApp', () => ({
  DailiesApp: () => <div data-testid="dailies">Dailies</div>,
}));
vi.mock('../../packages/web/src/neopets-more/NeopetsMoreApp', () => ({
  NeopetsMoreApp: () => <div data-testid="neopets-more">More</div>,
}));
vi.mock('../../packages/web/src/deck-builder/DeckBuilderApp', () => ({
  DeckBuilderApp: () => <div data-testid="deck-builder">Deck Builder</div>,
}));
vi.mock('../../packages/web/src/deck-review/DeckReviewApp', () => ({
  DeckReviewApp: () => <div data-testid="deck-review">Deck Review</div>,
}));
vi.mock('../../packages/web/src/deck-suggest/DeckSuggestApp', () => ({
  DeckSuggestApp: () => <div data-testid="deck-suggest">Deck Suggest</div>,
}));
vi.mock('../../packages/web/src/order-reconcile/OrderReconcileApp', () => ({
  OrderReconcileApp: () => <div data-testid="order-reconcile">Order Reconcile</div>,
}));
vi.mock('../../packages/web/src/SettingsShell', () => ({
  SettingsShell: ({ tab }: { tab?: string }) => (
    <div data-testid="settings" data-tab={tab ?? 'dailies'}>
      Settings
    </div>
  ),
}));
vi.mock('../../packages/web/src/cards/CardPicker', () => ({
  installHubCardPickerBridge: vi.fn(),
}));

const ROUTE_KEY = 'rayenz-hub-route';

function setHash(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}

function navLink(name: string) {
  return screen.getByRole('link', { name });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = '';
  document.body.removeAttribute('data-neopets-dailies');
});

describe('HubShell AppOutlet', () => {
  beforeEach(() => {
    setHash('/dailies');
  });

  it.each([
    ['/dailies', 'dailies', undefined],
    ['/neopets-more', 'neopets-more', undefined],
    ['/deck-builder', 'deck-builder', undefined],
    ['/deck-review', 'deck-review', undefined],
    ['/deck-suggest', 'deck-suggest', undefined],
    ['/order-reconcile', 'order-reconcile', undefined],
    ['/settings', 'settings', 'dailies'],
    ['/settings/dailies', 'settings', 'dailies'],
    ['/settings/deck-builder', 'settings', 'deck-builder'],
    ['/settings/deck-suggest', 'settings', 'deck-suggest'],
    ['/settings/order-reconcile', 'settings', 'order-reconcile'],
  ] as const)('renders %s outlet', (path, testId, settingsTab) => {
    setHash(path);
    render(<HubShell />);
    const outlet = screen.getByTestId(testId);
    expect(outlet).toBeInTheDocument();
    if (settingsTab) {
      expect(outlet).toHaveAttribute('data-tab', settingsTab);
    }
  });

  it('falls back to DailiesApp for unknown hash paths', () => {
    setHash('/unknown-route');
    render(<HubShell />);
    expect(screen.getByTestId('dailies')).toBeInTheDocument();
  });

  it('falls back to DailiesApp for unrecognized outlet paths', () => {
    vi.spyOn(useHubRouteModule, 'useHubRoute').mockReturnValue({
      path: '/not-a-real-route' as HubPath,
      navigate: vi.fn(),
      isSettings: false,
    });
    render(<HubShell />);
    expect(screen.getByTestId('dailies')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('installs the card picker bridge on mount', () => {
    render(<HubShell />);
    expect(installHubCardPickerBridge).toHaveBeenCalled();
  });
});

describe('HubShell nav toggle', () => {
  beforeEach(() => {
    setHash('/dailies');
  });

  it('opens and closes the nav drawer via toggle button', async () => {
    const user = userEvent.setup();
    render(<HubShell />);

    const nav = screen.getByRole('navigation', { name: 'Apps' });
    const backdrop = document.getElementById('hub-nav-backdrop')!;
    const toggle = screen.getByRole('button', { name: 'Open menu' });

    expect(nav).not.toHaveClass('open');
    expect(backdrop).not.toHaveClass('open');

    await user.click(toggle);
    expect(nav).toHaveClass('open');
    expect(backdrop).toHaveClass('open');

    await user.click(toggle);
    expect(nav).not.toHaveClass('open');
    expect(backdrop).not.toHaveClass('open');
  });

  it('closes the nav drawer when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    render(<HubShell />);

    const nav = screen.getByRole('navigation', { name: 'Apps' });
    const backdrop = document.getElementById('hub-nav-backdrop')!;

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(nav).toHaveClass('open');

    await user.click(backdrop);
    expect(nav).not.toHaveClass('open');
    expect(backdrop).not.toHaveClass('open');
  });

  it('closes the nav drawer when a nav link is clicked', async () => {
    const user = userEvent.setup();
    render(<HubShell />);

    const nav = screen.getByRole('navigation', { name: 'Apps' });
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(nav).toHaveClass('open');

    await user.click(navLink('Deck Builder'));
    expect(nav).not.toHaveClass('open');
  });
});

describe('HubNav active links', () => {
  it('marks the current app link active', () => {
    render(<HubNav path="/deck-review" open={false} onClose={() => {}} />);
    expect(navLink('Deck Review')).toHaveClass('active');
    expect(navLink('Deck Review')).toHaveAttribute('aria-current', 'page');
    expect(navLink('Dailies')).not.toHaveClass('active');
  });

  it('marks settings active for any settings subpath', () => {
    render(<HubNav path="/settings/deck-suggest" open={false} onClose={() => {}} />);
    const settings = navLink('Settings');
    expect(settings).toHaveClass('active');
    expect(settings).toHaveAttribute('aria-current', 'page');
    expect(navLink('Dailies')).not.toHaveClass('active');
  });

  it('marks the matching app link active on non-settings routes', () => {
    render(<HubNav path="/order-reconcile" open={false} onClose={() => {}} />);
    expect(navLink('Order Reconcile')).toHaveClass('active');
    expect(navLink('Deck Builder')).not.toHaveClass('active');
  });

  it('renders grouped nav labels', () => {
    render(<HubNav path="/dailies" open={false} onClose={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Apps' });
    expect(within(nav).getByText('Neopets')).toBeInTheDocument();
    expect(within(nav).getByText('MTG')).toBeInTheDocument();
    expect(navLink('Dailies')).toHaveAttribute('href', '#/dailies');
    expect(navLink('Settings')).toHaveAttribute('href', '#/settings');
  });
});

describe('HubShell route restore', () => {
  it('restores last route from localStorage when hash is empty', async () => {
    localStorage.setItem(ROUTE_KEY, '#/deck-suggest');
    window.location.hash = '';
    render(<HubShell />);
    await waitFor(() => {
      expect(screen.getByTestId('deck-suggest')).toBeInTheDocument();
    });
  });
});
