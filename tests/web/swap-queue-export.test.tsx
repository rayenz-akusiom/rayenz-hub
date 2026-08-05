import './helpers/swap-queue-vi-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockLoadSwapWantSources, wantSource } from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

const mockCopyArchidektWants = vi.fn();
const mockCopyNameQtyWants = vi.fn();

vi.mock('../../packages/web/src/swap-queue/export-ui', () => ({
  copyArchidektWants: (...args: unknown[]) => mockCopyArchidektWants(...args),
  copyNameQtyWants: (...args: unknown[]) => mockCopyNameQtyWants(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SwapQueueApp export actions', () => {
  beforeEach(() => {
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [wantSource()] });
  });

  it('copies an Archidekt-style import list', async () => {
    mockCopyArchidektWants.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export Archidekt' }));

    expect(mockCopyArchidektWants).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ cardName: 'Sol Ring' })]),
    );
    await waitFor(() => {
      expect(screen.getByText('Copied Archidekt-style list')).toBeInTheDocument();
    });
  });

  it('copies a name/qty list', async () => {
    mockCopyNameQtyWants.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export name/qty' }));

    expect(mockCopyNameQtyWants).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Copied name/qty list')).toBeInTheDocument();
    });
  });
});
