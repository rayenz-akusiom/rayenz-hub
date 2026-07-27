import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DailiesApp } from '../../packages/web/src/dailies/DailiesApp';
import * as acquisitionStore from '../../packages/web/src/dailies/acquisition-store';
import * as itemdb from '../../packages/web/src/dailies/itemdb';

vi.mock('../../packages/web/src/dailies/itemdb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/dailies/itemdb')>();
  return {
    ...actual,
    loadListTargets: vi.fn(actual.loadListTargets),
    markItemAcquired: vi.fn(actual.markItemAcquired),
  };
});

vi.mock('../../packages/web/src/dailies/acquisition-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/dailies/acquisition-store')>();
  return {
    ...actual,
    getProgressMeta: vi.fn(actual.getProgressMeta),
    getAcquired: vi.fn(actual.getAcquired),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DailiesApp', () => {
  it('renders the dailies page chrome', () => {
    render(<DailiesApp />);
    expect(screen.getByRole('heading', { name: /Rayenz's Dailies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open settings/i })).toBeInTheDocument();
  });

  it('shows tracking lists refresh and header mass sync', () => {
    render(<DailiesApp />);
    expect(screen.getByRole('heading', { name: 'Tracking lists' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync progress' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync this list' })).not.toBeInTheDocument();
  });

  it('does not expose blacklist menu actions', () => {
    render(<DailiesApp />);
    expect(screen.queryByRole('button', { name: /blacklist/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/clear blacklist/i)).not.toBeInTheDocument();
  });

  it('does not expose Next item skip control', async () => {
    render(<DailiesApp />);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Next item' })).not.toBeInTheDocument();
    });
  });

  it('dismisses wishlist context menu on outside pointerdown and Escape', async () => {
    const user = userEvent.setup();
    render(<DailiesApp />);

    const menuBtn = await screen.findAllByRole('button', { name: 'List options' });
    expect(menuBtn.length).toBeGreaterThan(0);

    await user.click(menuBtn[0]!);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('button', { name: 'Close' })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    await user.click(menuBtn[0]!);
    expect(await screen.findByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('wishlist card acquire + Remaining', () => {
    const list = {
      id: 'gourmet-food',
      label: 'Gourmet Foods',
      listUrl: 'https://itemdb.com.br/lists/official/gourmet-food',
      slug: 'gourmet-food',
      user: 'official',
      img: '',
      enabled: true,
    };
    const item = {
      itemIid: 42,
      name: 'Omlette',
      description: 'Yum',
      image: 'https://example.com/omlette.gif',
      priceNp: 100,
      shopWizardUrl: 'https://www.neopets.com/shops/wizard.phtml?string=Omlette',
    };

    beforeEach(() => {
      vi.mocked(itemdb.loadListTargets).mockResolvedValue([
        {
          list,
          item,
          error: null,
          fromCache: true,
          cachedAt: Date.now(),
          refreshed: false,
        },
      ]);
      vi.mocked(itemdb.markItemAcquired).mockResolvedValue({
        list,
        item: null,
        error: null,
        fromCache: true,
        cachedAt: Date.now(),
        refreshed: false,
      });
      vi.mocked(acquisitionStore.getProgressMeta).mockResolvedValue({
        catalogCounts: { 'gourmet-food': 10 },
        acquiredCounts: { 'gourmet-food': 3 },
        remainingCounts: { 'gourmet-food': 7 },
      });
      vi.mocked(acquisitionStore.getAcquired).mockResolvedValue({
        listId: 'gourmet-food',
        byItemIid: {
          '1': { acquiredAt: 1, source: 'manual' },
          '2': { acquiredAt: 1, source: 'manual' },
          '3': { acquiredAt: 1, source: 'manual' },
        },
      });
    });

    it('shows Mark acquired action and Remaining-only visible stat', async () => {
      render(<DailiesApp />);

      expect(
        await screen.findByRole('button', { name: 'Mark "Omlette" acquired' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Next item' })).not.toBeInTheDocument();

      const remaining = await screen.findByText('Remaining 7');
      expect(remaining).toHaveAttribute('title', 'acquired 3 / catalog 10');
      expect(remaining).toHaveAttribute('aria-label', 'acquired 3 / catalog 10');
      expect(screen.queryByText(/acquired 3 \/ catalog 10/)).not.toBeInTheDocument();
    });

    it('marks current item acquired from the checkmark button', async () => {
      const user = userEvent.setup();
      render(<DailiesApp />);

      const acquireBtn = await screen.findByRole('button', { name: 'Mark "Omlette" acquired' });
      await user.click(acquireBtn);

      await waitFor(() => {
        expect(itemdb.markItemAcquired).toHaveBeenCalledWith(list, 42, 'manual');
      });
    });
  });
});
