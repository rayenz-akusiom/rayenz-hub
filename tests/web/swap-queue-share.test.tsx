import './helpers/swap-queue-vi-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregateSwapWants } from '@rayenz-hub/shared';
import {
  mockLoadPublicSwapWantSources,
  mockLoadSwapWantSources,
  pairDeck,
} from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
  sessionStorage.clear();
});

describe('SwapQueueApp username share links', () => {
  beforeEach(() => {
    window.location.hash = '';
    sessionStorage.clear();
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [] });
    mockLoadPublicSwapWantSources.mockResolvedValue(null);
  });

  it('loads a guest hash as a read-only public queue', async () => {
    const deck = pairDeck();
    mockLoadPublicSwapWantSources.mockResolvedValue({
      username: 'Friend',
      slug: 'friend',
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    window.location.hash = '#/swap-queue/friend';
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: "Friend's Swap Queue" })).toBeInTheDocument();
    });
    expect(mockLoadPublicSwapWantSources).toHaveBeenCalledWith('friend');
    expect(mockLoadSwapWantSources).not.toHaveBeenCalled();
    expect(document.querySelector('.swap-queue-app')).toHaveAttribute('data-readonly', 'true');
    expect(screen.queryByRole('button', { name: 'Add swap' })).not.toBeInTheDocument();
    expect(screen.getByText(/Sol Ring/)).toBeInTheDocument();
  });

  it('shows an error for an unknown username slug', async () => {
    window.location.hash = '#/swap-queue/nobody';
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() => {
      expect(screen.getByText('Unknown user “nobody”')).toBeInTheDocument();
    });
    expect(mockLoadPublicSwapWantSources).toHaveBeenCalledWith('nobody');
    expect(screen.queryByRole('button', { name: 'Add swap' })).not.toBeInTheDocument();
  });

  it('copies a share link for the signed-in username', async () => {
    sessionStorage.setItem('rayenz-hub-access-token', 'token');
    sessionStorage.setItem('rayenz-hub-username', 'Rayenz');
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Swap Queue actions' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy share link' }));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}${window.location.pathname}#/swap-queue/rayenz`,
    );
    await waitFor(() => {
      expect(screen.getByText('Copied share link')).toBeInTheDocument();
    });
  });

  it('copies the viewed queue share link for a signed-in invitee', async () => {
    sessionStorage.setItem('rayenz-hub-access-token', 'token');
    sessionStorage.setItem('rayenz-hub-username', 'Friend');
    const deck = pairDeck();
    mockLoadPublicSwapWantSources.mockResolvedValue({
      username: 'Rayenz',
      slug: 'rayenz',
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    window.location.hash = '#/swap-queue/rayenz';
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: "Rayenz's Swap Queue" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy share link' }));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}${window.location.pathname}#/swap-queue/rayenz`,
    );
  });

  it('asks the user to sign in when there is no username to share', async () => {
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Swap Queue actions' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy share link' }));

    await waitFor(() => {
      expect(screen.getByText('Sign in to copy a share link')).toBeInTheDocument();
    });
  });
});
