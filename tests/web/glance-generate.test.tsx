import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { GlanceGenerateButton } from '../../packages/web/src/deck-builder/commander/GlanceGenerateButton';
import { buildEligibleCommanderDeck } from '../fixtures/deck-builder/glance-eligible.ts';

const apiConfigured = vi.hoisted(() => ({ value: true }));
const postGlance = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));

vi.mock('../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => apiConfigured.value,
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiPostDeckGlance: (deckId: string) => postGlance(deckId),
}));

describe('GlanceGenerateButton', () => {
  afterEach(() => {
    cleanup();
    apiConfigured.value = true;
    postGlance.mockClear();
  });

  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:glance-preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('is disabled when Hub API is not configured', async () => {
    apiConfigured.value = false;
    const deck = buildEligibleCommanderDeck();
    render(<GlanceGenerateButton deck={deck} />);
    expect(screen.getByRole('button', { name: 'Generate glance' })).toBeDisabled();
  });

  it('shows a clear error for local-only decks without API sync', async () => {
    const deck: DeckDocument = { ...buildEligibleCommanderDeck(), deckId: '' };
    render(<GlanceGenerateButton deck={deck} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Generate glance' }));
    expect(
      await screen.findByText(/save this deck to the hub api before generating/i),
    ).toBeInTheDocument();
    expect(postGlance).not.toHaveBeenCalled();
  });

  it('generates, previews, and exposes download without client canvas fallback', async () => {
    const deck = buildEligibleCommanderDeck();
    render(<GlanceGenerateButton deck={deck} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Generate glance' }));
    await waitFor(() => expect(postGlance).toHaveBeenCalledWith(deck.deckId));
    expect(await screen.findByRole('img', { name: 'Deck glance preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });
});
