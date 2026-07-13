import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DailiesSettingsPage } from '../../packages/web/src/pages/DailiesSettingsPage';

const fetchDailiesSettings = vi.fn();
const saveDailiesSettings = vi.fn();

vi.mock('../../packages/web/src/api/hub-api', () => ({
  getHubApiConfig: () => ({ url: 'http://127.0.0.1:3000', key: 'test-api-key-local', enabled: true }),
  fetchDailiesSettings: (...args: unknown[]) => fetchDailiesSettings(...args),
  saveDailiesSettings: (...args: unknown[]) => saveDailiesSettings(...args),
}));

describe('DailiesSettingsPage', () => {
  beforeEach(() => {
    fetchDailiesSettings.mockResolvedValue({ faerieQuest: 'jhudora', schools: { battledome: true } });
    saveDailiesSettings.mockResolvedValue(undefined);
  });

  it('loads settings from API and saves on submit', async () => {
    const user = userEvent.setup();
    render(<DailiesSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Jhudora')).toBeChecked();
    });

    await user.click(screen.getByLabelText('Illusen'));
    await user.click(screen.getByRole('button', { name: 'Save to API' }));

    await waitFor(() => {
      expect(screen.getByText('Settings saved to API.')).toBeInTheDocument();
    });

    expect(saveDailiesSettings).toHaveBeenCalledWith(
      expect.objectContaining({ faerieQuest: 'illusen' }),
    );
  });
});
