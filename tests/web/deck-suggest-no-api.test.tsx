import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DeckSuggestApp } from '../../packages/web/src/deck-suggest/DeckSuggestApp';
import { resetHubModules } from '../unit/helpers/hubHarness';
import { progressController } from './helpers/hub-progress-mock';

vi.mock('../../packages/web/src/lib/hub-progress', async () => {
  const { hubProgressMockModule } = await import('./helpers/hub-progress-mock');
  return hubProgressMockModule();
});

vi.mock('../../packages/web/src/lib/hub-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/lib/hub-storage')>();
  return {
    ...actual,
    loadDeckSuggestSettings: vi.fn(() => ({
      setCodes: 'MSH',
      releaseId: 'group:ltr',
      setInputMode: 'release',
    })),
    saveDeckSuggestSettings: vi.fn(),
  };
});

vi.mock('../../packages/web/src/api/hub-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/api/hub-api')>();
  return {
    ...actual,
    isApiConfigured: () => false,
  };
});

vi.mock('../../packages/web/src/deck-suggest/generation', () => ({
  generateSuggestions: vi.fn(),
  transferToDeckReview: vi.fn(),
}));

vi.mock('../../packages/web/src/deck-suggest/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-suggest/data')>();
  return {
    ...actual,
    loadHubLibraryDecks: vi.fn(async () => [{ deck_id: 'd1', deck_name: 'Test Deck' }]),
  };
});

beforeEach(() => {
  resetHubModules();
  progressController.start.mockClear();
  progressController.update.mockClear();
  progressController.finish.mockClear();
});

afterEach(() => {
  cleanup();
  resetHubModules();
  document.body.innerHTML = '';
});

describe('Deck Suggest without API', () => {
  it('shows the API prerequisite and keeps generate disabled', () => {
    render(<DeckSuggestApp />);
    expect(
      screen.getByText(/Configure API URL and key in Settings to generate suggestions/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByText(/Configure API URL and key in Settings/i)).toBeInTheDocument();
  });
});
