import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsShell } from '../../packages/web/src/SettingsShell';
import { DailiesSettingsPage } from '../../packages/web/src/pages/DailiesSettingsPage';
import { DeckBuilderSettingsPage } from '../../packages/web/src/pages/DeckBuilderSettingsPage';
import { DeckSuggestSettingsPage } from '../../packages/web/src/pages/DeckSuggestSettingsPage';
import { OrderReconcileSettingsPage } from '../../packages/web/src/pages/OrderReconcileSettingsPage';

const loadDailiesSettings = vi.fn();
const persistDailiesSettings = vi.fn();
const loadDeckBuilderSettings = vi.fn();
const loadDeckSuggestSettings = vi.fn();
const loadOrderReconcileSettings = vi.fn();
const persistDeckBuilderSettings = vi.fn();
const persistDeckSuggestSettings = vi.fn();
const persistOrderReconcileSettings = vi.fn();
const getHubApiConfig = vi.fn(() => ({
  url: 'http://127.0.0.1:3000',
  key: 'test-api-key-local',
  enabled: true,
}));

vi.mock('../../packages/web/src/api/hub-api', () => ({
  getHubApiConfig: (...args: unknown[]) => getHubApiConfig(...args),
  loadDailiesSettings: (...args: unknown[]) => loadDailiesSettings(...args),
  persistDailiesSettings: (...args: unknown[]) => persistDailiesSettings(...args),
  loadDeckBuilderSettings: (...args: unknown[]) => loadDeckBuilderSettings(...args),
  persistDeckBuilderSettings: (...args: unknown[]) => persistDeckBuilderSettings(...args),
  loadDeckSuggestSettings: (...args: unknown[]) => loadDeckSuggestSettings(...args),
  loadOrderReconcileSettings: (...args: unknown[]) => loadOrderReconcileSettings(...args),
  persistDeckSuggestSettings: (...args: unknown[]) => persistDeckSuggestSettings(...args),
  persistOrderReconcileSettings: (...args: unknown[]) => persistOrderReconcileSettings(...args),
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
    getHubApiConfig.mockReturnValue({
      url: 'http://127.0.0.1:3000',
      key: 'test-api-key-local',
      enabled: true,
    });
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
          {
            id: 'w2',
            label: 'Food',
            listUrl: 'https://itemdb.com.br/lists/u/f',
            slug: 'f',
            user: 'u',
            img: '',
          },
        ],
      },
      source: 'api',
    });
    persistDailiesSettings.mockReset();
    persistDailiesSettings.mockResolvedValue('api');
    delete (window as Window & { __neopetsFetch?: unknown }).__neopetsFetch;
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

  it('shows localStorage and defaults load banners', async () => {
    loadDailiesSettings.mockResolvedValueOnce({ settings: null, source: 'local' });
    const { unmount } = render(<DailiesSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Loaded from localStorage/i)).toBeInTheDocument();
    });
    unmount();

    loadDailiesSettings.mockResolvedValueOnce({ settings: null, source: 'none' });
    render(<DailiesSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No saved settings yet/i)).toBeInTheDocument();
    });
  });

  it('shows load error banner', async () => {
    loadDailiesSettings.mockRejectedValueOnce(new Error('settings boom'));
    render(<DailiesSettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('settings boom');
    });
  });

  it('warns when Hub API is not configured', async () => {
    getHubApiConfig.mockReturnValue({ url: '', key: '', enabled: false });
    render(<DailiesSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Hub API is not configured/i)).toBeInTheDocument();
    });
  });

  it('requires a main pet name before saving', async () => {
    const user = userEvent.setup();
    loadDailiesSettings.mockResolvedValueOnce({
      settings: { faerieQuest: 'jhudora', mainPetName: '', wishlists: [] },
      source: 'none',
    });
    render(<DailiesSettingsPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText(/Choose a main pet name/i)).toBeInTheDocument();
    expect(persistDailiesSettings).not.toHaveBeenCalled();
  });

  it('saves to localStorage and surfaces persist errors', async () => {
    const user = userEvent.setup();
    persistDailiesSettings.mockResolvedValueOnce('local');
    render(<DailiesSettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Test_Pet')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.getByText(/Saved to localStorage/i)).toBeInTheDocument();
    });

    persistDailiesSettings.mockRejectedValueOnce(new Error('persist failed'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('persist failed');
    });
  });

  it('toggles schools and manages wishlists', async () => {
    const user = userEvent.setup();
    render(<DailiesSettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Stamps')).toBeInTheDocument());

    const battledome = screen.getByLabelText('Battledome');
    await user.click(battledome);

    await user.click(screen.getByRole('button', { name: 'Add wishlist' }));
    expect(screen.getByDisplayValue('New wishlist')).toBeInTheDocument();

    const downButtons = screen.getAllByRole('button', { name: 'Down' });
    await user.click(downButtons[0]!);
    const upButtons = screen.getAllByRole('button', { name: 'Up' });
    await user.click(upButtons[1]!);

    fireEvent.change(screen.getAllByLabelText(/ItemDB list URL/i)[0]!, {
      target: { value: 'https://itemdb.com.br/lists/rayenz/stamps2' },
    });

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await user.click(removeButtons[removeButtons.length - 1]!);

    await user.click(screen.getByRole('button', { name: 'Reset defaults' }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue('New wishlist')).not.toBeInTheDocument();
    });
  });

  it('looks up pet slug on blur with and without the Neopets bridge', async () => {
    const user = userEvent.setup();
    render(<DailiesSettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Test_Pet')).toBeInTheDocument());

    const petInput = screen.getByLabelText(/Pet name/i);
    await user.clear(petInput);
    await user.type(petInput, 'New_Pet');
    fireEvent.blur(petInput);
    await waitFor(() => {
      expect(screen.getByText(/userscript bridge \(optional\)/i)).toBeInTheDocument();
    });

    const fetchPet = vi.fn().mockResolvedValue('<img src="https://pets.neopets.com/cp/abc123/1/1.png">');
    (window as Window & { __neopetsFetch?: typeof fetchPet }).__neopetsFetch = fetchPet;
    await user.clear(petInput);
    await user.type(petInput, 'Bridge_Pet');
    fireEvent.blur(petInput);
    await waitFor(() => {
      expect(screen.getByText(/Pet image slug found/i)).toBeInTheDocument();
    });

    fetchPet.mockResolvedValueOnce('<div>no pet image</div>');
    await user.clear(petInput);
    await user.type(petInput, 'Missing_Slug');
    fireEvent.blur(petInput);
    await waitFor(() => {
      expect(screen.getByText(/no image slug found/i)).toBeInTheDocument();
    });

    fetchPet.mockRejectedValueOnce(new Error('bridge down'));
    await user.clear(petInput);
    await user.type(petInput, 'Fail_Pet');
    fireEvent.blur(petInput);
    await waitFor(() => {
      expect(screen.getByText(/Could not look up pet/i)).toBeInTheDocument();
    });
  });
});

describe('DeckBuilderSettingsPage', () => {
  beforeEach(() => {
    loadDeckBuilderSettings.mockResolvedValue({
      settings: { allyThreeColourNames: 'shards', enemyThreeColourNames: 'wedges' },
      source: 'api',
    });
    persistDeckBuilderSettings.mockResolvedValue('api');
  });

  it('loads colour-identity name preferences and saves changes', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Loaded from API/)).toBeInTheDocument();
    });

    const allySelect = screen.getByLabelText('Ally three-colour names');
    const enemySelect = screen.getByLabelText('Enemy three-colour names');
    expect(allySelect).toHaveValue('shards');
    expect(enemySelect).toHaveValue('wedges');

    await user.selectOptions(allySelect, 'capenna');
    await user.selectOptions(enemySelect, 'ikoria');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText(/Saved to API/)).toBeInTheDocument();
    });

    expect(persistDeckBuilderSettings).toHaveBeenCalledWith({
      allyThreeColourNames: 'capenna',
      enemyThreeColourNames: 'ikoria',
    });
  });
});

describe('DeckSuggestSettingsPage', () => {
  beforeEach(() => {
    loadDeckSuggestSettings.mockResolvedValue({
      settings: {
        setCodes: 'MSH,MSC',
        folderUrl: 'https://archidekt.com/folders/123',
        deckLoadTab: 'folder',
        rulesDebug: false,
      },
      source: 'api',
    });
    persistDeckSuggestSettings.mockResolvedValue('api');
  });

  it('loads set pool fields and persists edits', async () => {
    const user = userEvent.setup();
    render(<DeckSuggestSettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('MSH,MSC')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('https://archidekt.com/folders/123')).toBeInTheDocument();

    const setCodes = screen.getByLabelText('Set codes (comma-separated)');
    await user.clear(setCodes);
    await user.type(setCodes, 'MAR');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText(/Saved to API/)).toBeInTheDocument();
    });

    expect(persistDeckSuggestSettings).toHaveBeenCalledWith(
      expect.objectContaining({ setCodes: 'MAR' }),
    );
  });
});

describe('OrderReconcileSettingsPage', () => {
  beforeEach(() => {
    loadOrderReconcileSettings.mockResolvedValue({
      settings: {
        folderUrl: 'https://archidekt.com/folders/or',
        stagingDeckUrl: 'https://archidekt.com/decks/staging',
        registrySource: 'folder',
        customDeckUrls: '',
      },
      source: 'api',
    });
    persistOrderReconcileSettings.mockResolvedValue('api');
  });

  it('loads Archidekt URLs and saves updates', async () => {
    const user = userEvent.setup();
    render(<OrderReconcileSettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://archidekt.com/folders/or')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('https://archidekt.com/decks/staging')).toBeInTheDocument();

    const staging = screen.getByLabelText('Buy/trade staging deck URL');
    await user.clear(staging);
    await user.type(staging, 'https://archidekt.com/decks/new-staging');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText(/Saved to API/)).toBeInTheDocument();
    });

    expect(persistOrderReconcileSettings).toHaveBeenCalledWith(
      expect.objectContaining({ stagingDeckUrl: 'https://archidekt.com/decks/new-staging' }),
    );
  });
});
