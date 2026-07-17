import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { SettingsShell } from '../../packages/web/src/SettingsShell';
import { DeckBuilderSettingsPage } from '../../packages/web/src/pages/DeckBuilderSettingsPage';

vi.mock('../../packages/web/src/api/hub-api', () => ({
  getHubApiConfig: () => ({ url: '', key: '', enabled: false }),
  loadDeckBuilderSettings: vi.fn(async () => ({ settings: null, source: 'defaults' })),
  persistDeckBuilderSettings: vi.fn(async () => 'local'),
  loadDailiesSettings: vi.fn(async () => ({ settings: null, source: 'defaults' })),
  persistDailiesSettings: vi.fn(async () => 'local'),
  loadDeckSuggestSettings: vi.fn(async () => ({ settings: null, source: 'defaults' })),
  persistDeckSuggestSettings: vi.fn(async () => 'local'),
  loadOrderReconcileSettings: vi.fn(async () => ({ settings: null, source: 'defaults' })),
  persistOrderReconcileSettings: vi.fn(async () => 'local'),
}));

afterEach(() => {
  cleanup();
});

describe('Deck builders settings label', () => {
  beforeEach(() => {
    window.location.hash = '#/settings/deck-builder';
  });

  it('SettingsShell tab is labeled Deck builders', async () => {
    render(<SettingsShell tab="deck-builder" />);
    expect(screen.getByRole('button', { name: 'Deck builders' })).toBeInTheDocument();
  });

  it('DeckBuilderSettingsPage heading says Deck builders', async () => {
    render(<DeckBuilderSettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Deck builders' })).toBeInTheDocument();
    });
  });
});
