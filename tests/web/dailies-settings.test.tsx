import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsShell } from '../../packages/web/src/SettingsShell';
import { DailiesSettingsPage } from '../../packages/web/src/pages/DailiesSettingsPage';

const loadDailiesSettings = vi.fn();
const persistDailiesSettings = vi.fn();
const loadDeckSuggestSettings = vi.fn();
const loadOrderReconcileSettings = vi.fn();

vi.mock('../../packages/web/src/api/hub-api', () => ({
  getHubApiConfig: () => ({ url: 'http://127.0.0.1:3000', key: 'test-api-key-local', enabled: true }),
  loadDailiesSettings: (...args: unknown[]) => loadDailiesSettings(...args),
  persistDailiesSettings: (...args: unknown[]) => persistDailiesSettings(...args),
  loadDeckSuggestSettings: (...args: unknown[]) => loadDeckSuggestSettings(...args),
  loadOrderReconcileSettings: (...args: unknown[]) => loadOrderReconcileSettings(...args),
  persistDeckSuggestSettings: vi.fn(),
  persistOrderReconcileSettings: vi.fn(),
  fetchDailiesSettings: (...args: unknown[]) => loadDailiesSettings(...args).then((r: { settings: unknown }) => r.settings),
  saveDailiesSettings: (...args: unknown[]) => persistDailiesSettings(...args),
}));

afterEach(() => {
  cleanup();
});

describe('SettingsShell', () => {
  beforeEach(() => {
    loadDailiesSettings.mockResolvedValue({
      settings: { faerieQuest: 'jhudora', mainPetName: 'Test_Pet', wishlists: [] },
      source: 'api',
    });
    loadDeckSuggestSettings.mockResolvedValue({ settings: null, source: 'none' });
    loadOrderReconcileSettings.mockResolvedValue({ settings: null, source: 'none' });
    persistDailiesSettings.mockResolvedValue('api');
  });

  it('renders settings tabs', async () => {
    render(<SettingsShell />);
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dailies' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deck Suggest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Order Reconcile' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Main pet')).toBeInTheDocument();
    });
  });
});

describe('DailiesSettingsPage', () => {
  beforeEach(() => {
    loadDailiesSettings.mockResolvedValue({
      settings: {
        faerieQuest: 'jhudora',
        schools: { battledome: true },
        mainPetName: 'Test_Pet',
        wishlists: [
          {
            id: 'w1',
            label: 'Stamps',
            listUrl: 'https://itemdb.com.br/lists/u/s',
            slug: 's',
            user: 'u',
            img: '',
          },
        ],
      },
      source: 'api',
    });
    persistDailiesSettings.mockResolvedValue('api');
  });

  it('loads settings and shows main pet and wishlists', async () => {
    const user = userEvent.setup();
    render(<DailiesSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Jhudora')).toBeChecked();
    });
    expect(screen.getByDisplayValue('Test_Pet')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Stamps')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Illusen'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText(/Saved to API/)).toBeInTheDocument();
    });

    expect(persistDailiesSettings).toHaveBeenCalledWith(
      expect.objectContaining({ faerieQuest: 'illusen', mainPetName: 'Test_Pet' }),
    );
  });
});
