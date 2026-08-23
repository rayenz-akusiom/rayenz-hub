import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { GLANCE_GENERATION_VERSION } from '@rayenz-hub/shared';
import { GlanceGenerateButton } from '../../packages/web/src/deck-builder/commander/GlanceGenerateButton';
import {
  buildEligibleCommanderDeck,
  buildMultiLieutenantCommanderDeck,
} from '../fixtures/deck-builder/glance-eligible.ts';
import { stubGlanceObjectUrls } from './helpers/glance-stub.ts';
import { clearHubAuthSession, setHubAuthSession } from '../../packages/web/src/lib/hub-auth-session';

const apiConfigured = vi.hoisted(() => ({ value: true }));
const postGlance = vi.hoisted(() =>
  vi.fn(
    async (
      _deckId: string,
      _request?: { lieutenantInstanceIds?: string[]; mode?: 'type_line' | 'primary_category' },
    ) => ({
      blob: new Blob(['png'], { type: 'image/png' }),
      cache: 'MISS',
      generation: GLANCE_GENERATION_VERSION,
      delivery: 'inline' as const,
    }),
  ),
);

vi.mock('../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => apiConfigured.value,
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-glance-api', () => ({
  apiPostDeckGlance: (
    deckId: string,
    request?: { lieutenantInstanceIds?: string[]; mode?: 'type_line' | 'primary_category' },
  ) => postGlance(deckId, request),
}));

describe('GlanceGenerateButton', () => {
  afterEach(() => {
    cleanup();
    apiConfigured.value = true;
    postGlance.mockClear();
    clearHubAuthSession();
  });

  beforeEach(() => {
    stubGlanceObjectUrls();
    setHubAuthSession({ accessToken: 't', username: 'Rayenz', isOwner: true });
    postGlance.mockImplementation(async () => ({
      blob: new Blob(['png'], { type: 'image/png' }),
      cache: 'MISS',
      generation: GLANCE_GENERATION_VERSION,
      delivery: 'inline' as const,
    }));
  });

  it('is disabled when Hub API is not configured', async () => {
    apiConfigured.value = false;
    const deck = buildEligibleCommanderDeck();
    render(<GlanceGenerateButton deck={deck} />);
    expect(screen.getByRole('button', { name: 'Generate glance' })).toBeDisabled();
  });

  it('is disabled for a non-owner session and does not POST', async () => {
    setHubAuthSession({ accessToken: 't', username: 'friend', isOwner: false });
    const deck = buildEligibleCommanderDeck();
    render(<GlanceGenerateButton deck={deck} />);
    const button = screen.getByRole('button', { name: 'Generate glance' });
    expect(button).toBeDisabled();
    expect(postGlance).not.toHaveBeenCalled();
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

  it('opens options without generating until confirmed', async () => {
    const deck = buildEligibleCommanderDeck();
    render(<GlanceGenerateButton deck={deck} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Generate glance' }));

    expect(screen.getByRole('radio', { name: /main \+ lands/i })).toBeChecked();
    expect(screen.getByText(/choose a layout, then generate/i)).toBeInTheDocument();
    expect(postGlance).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() =>
      expect(postGlance).toHaveBeenCalledWith(deck.deckId, { mode: 'type_line' }),
    );
    expect(await screen.findByRole('img', { name: 'Deck glance preview' })).toBeInTheDocument();
    const status = screen.getByText(/Ready · freshly rendered/i);
    expect(status).toBeInTheDocument();
    expect(status.getAttribute('title') || '').toMatch(
      new RegExp(`gen ${GLANCE_GENERATION_VERSION} · cache MISS`, 'i'),
    );
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });

  it('waits for generate after switching layout, and restores a matching session cache', async () => {
    const deck = buildEligibleCommanderDeck();
    render(<GlanceGenerateButton deck={deck} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Generate glance' }));

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(postGlance).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('radio', { name: /primary categories/i }));
    expect(postGlance).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('img', { name: 'Deck glance preview' })).not.toBeInTheDocument();
    expect(screen.getByText(/choose a layout, then generate/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() =>
      expect(postGlance).toHaveBeenCalledWith(deck.deckId, { mode: 'primary_category' }),
    );
    expect(postGlance).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('radio', { name: /main \+ lands/i }));
    expect(postGlance).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('img', { name: 'Deck glance preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  it('asks which lieutenants to highlight when the deck has more than two', async () => {
    const deck = buildMultiLieutenantCommanderDeck(4);
    render(<GlanceGenerateButton deck={deck} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Generate glance' }));

    expect(await screen.findByText(/this deck has 4 lieutenants/i)).toBeInTheDocument();
    expect(postGlance).not.toHaveBeenCalled();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    // Auto-picks are pre-selected; swap the second one for a later lieutenant.
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await user.click(options[1]!);
    await user.click(options[3]!);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(postGlance).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /main \+ lands/i })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() =>
      expect(postGlance).toHaveBeenCalledWith(deck.deckId, {
        lieutenantInstanceIds: ['spell-0', 'spell-3'],
        mode: 'type_line',
      }),
    );
    expect(await screen.findByRole('img', { name: 'Deck glance preview' })).toBeInTheDocument();
  });

  it('caps the lieutenant highlight selection at two', async () => {
    const deck = buildMultiLieutenantCommanderDeck(4);
    render(<GlanceGenerateButton deck={deck} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Generate glance' }));

    const options = await screen.findAllByRole('option');
    await user.click(options[2]!);
    expect(options[2]).toHaveAttribute('aria-selected', 'false');

    await user.click(options[0]!);
    await user.click(options[2]!);
    expect(options[2]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('portals the overlay to document.body so sticky chrome cannot trap it above the FAB', async () => {
    const deck = buildEligibleCommanderDeck();
    const { container } = render(
      <div className="hub-sticky-chrome">
        <GlanceGenerateButton deck={deck} />
      </div>,
    );
    const sticky = container.querySelector('.hub-sticky-chrome');
    expect(sticky).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Generate glance' }));

    const dialog = await screen.findByRole('dialog', { name: 'Deck glance' });
    expect(dialog.classList.contains('db-modal')).toBe(true);
    expect(dialog.parentElement).toBe(document.body);
    expect(sticky!.contains(dialog)).toBe(false);
  });
});
