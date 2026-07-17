import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHubRoute } from '../../packages/web/src/hub/useHubRoute';

const ROUTE_KEY = 'rayenz-hub-route';

function RouteProbe() {
  const { path, navigate, isSettings } = useHubRoute();
  return (
    <div>
      <span data-testid="path">{path}</span>
      <span data-testid="is-settings">{String(isSettings)}</span>
      <button type="button" onClick={() => navigate('#/deck-builder')}>
        go-deck-builder
      </button>
      <button type="button" onClick={() => navigate('#/dailies')}>
        go-dailies
      </button>
      <button
        type="button"
        data-testid="same-hash"
        onClick={() => navigate(window.location.hash || '#/dailies')}
      >
        same-hash
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = '';
  document.body.removeAttribute('data-neopets-dailies');
  delete (window as Window & { HubRouter?: unknown }).HubRouter;
});

describe('useHubRoute', () => {
  beforeEach(() => {
    window.location.hash = '#/dailies';
  });

  it('initializes path from the current hash', () => {
    window.location.hash = '#/order-reconcile';
    render(<RouteProbe />);
    expect(screen.getByTestId('path')).toHaveTextContent('/order-reconcile');
    expect(screen.getByTestId('is-settings')).toHaveTextContent('false');
  });

  it('restores hash from localStorage when location hash is empty', async () => {
    localStorage.setItem(ROUTE_KEY, '#/deck-review');
    window.location.hash = '';
    render(<RouteProbe />);
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent('/deck-review');
    });
  });

  it('falls back to default route when localStorage is unavailable', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    window.location.hash = '';
    render(<RouteProbe />);
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent('/dailies');
    });
    getItem.mockRestore();
  });

  it('updates path on hashchange', async () => {
    render(<RouteProbe />);
    expect(screen.getByTestId('path')).toHaveTextContent('/dailies');

    window.location.hash = '#/neopets-more';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent('/neopets-more');
    });
  });

  it('sets data-neopets-dailies on /dailies and removes it elsewhere', async () => {
    const user = userEvent.setup();
    render(<RouteProbe />);

    expect(document.body.getAttribute('data-neopets-dailies')).toBe('rayenz');

    await user.click(screen.getByRole('button', { name: 'go-deck-builder' }));
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent('/deck-builder');
    });
    expect(document.body.hasAttribute('data-neopets-dailies')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'go-dailies' }));
    await waitFor(() => {
      expect(document.body.getAttribute('data-neopets-dailies')).toBe('rayenz');
    });
  });

  it('navigate updates hash for a new route and persists to localStorage', async () => {
    const user = userEvent.setup();
    render(<RouteProbe />);

    await user.click(screen.getByRole('button', { name: 'go-deck-builder' }));
    await waitFor(() => {
      expect(window.location.hash).toBe('#/deck-builder');
      expect(localStorage.getItem(ROUTE_KEY)).toBe('#/deck-builder');
    });
  });

  it('navigate applies path immediately when hash is unchanged', async () => {
    window.location.hash = '#/dailies';
    const user = userEvent.setup();
    render(<RouteProbe />);

    expect(document.body.getAttribute('data-neopets-dailies')).toBe('rayenz');
    document.body.removeAttribute('data-neopets-dailies');

    await user.click(screen.getByTestId('same-hash'));

    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent('/dailies');
      expect(document.body.getAttribute('data-neopets-dailies')).toBe('rayenz');
      expect(window.location.hash).toBe('#/dailies');
    });
  });

  it('reports isSettings for settings routes', async () => {
    window.location.hash = '#/settings/deck-suggest';
    render(<RouteProbe />);
    expect(screen.getByTestId('path')).toHaveTextContent('/settings/deck-suggest');
    expect(screen.getByTestId('is-settings')).toHaveTextContent('true');
  });

  it('exposes HubRouter on window with navigate and getRoutePath', async () => {
    const user = userEvent.setup();
    render(<RouteProbe />);

    type HubRouterApi = { navigate: (h: string) => void; getRoutePath: () => string };
    const w = window as Window & { HubRouter?: HubRouterApi };

    expect(w.HubRouter).toBeDefined();
    expect(w.HubRouter!.getRoutePath()).toBe('/dailies');

    w.HubRouter!.navigate('#/deck-suggest');
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent('/deck-suggest');
      expect(w.HubRouter!.getRoutePath()).toBe('/deck-suggest');
    });

    await user.click(screen.getByRole('button', { name: 'go-deck-builder' }));
    await waitFor(() => {
      expect(w.HubRouter!.getRoutePath()).toBe('/deck-builder');
    });
  });

  it('ignores localStorage write failures', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const user = userEvent.setup();
    render(<RouteProbe />);

    await user.click(screen.getByRole('button', { name: 'go-deck-builder' }));
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent('/deck-builder');
    });

    setItem.mockRestore();
  });
});
