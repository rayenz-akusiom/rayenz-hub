import './helpers/swap-queue-vi-mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument, WantSource } from '@rayenz-hub/shared';
import { mockLoadSwapWantSources, wantSource } from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

function deckForSource(s: WantSource): DeckDocument {
  return {
    schemaVersion: 1,
    deckId: s.deckId,
    name: s.deckName,
    format: s.format === 'other' ? 'commander' : s.format,
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards: [
      {
        instanceId: s.cardInstanceId,
        name: s.cardName,
        quantity: s.quantity,
        primaryCategory: 'Other',
        categories: ['Other'],
        stack: null,
        setCode: null,
        collectorNumber: null,
        scryfallId: null,
        archidektCardId: null,
        foil: false,
        proxy: false,
      },
      ...(s.outInstanceId
        ? [
            {
              instanceId: s.outInstanceId,
              name: 'Cut Card',
              quantity: 1,
              primaryCategory: 'Other',
              categories: ['Other'],
              stack: null,
              setCode: null,
              collectorNumber: null,
              scryfallId: null,
              archidektCardId: null,
              foil: false,
              proxy: false,
            },
          ]
        : []),
    ],
    oracle: {},
    formalSwapEntries:
      s.kind === 'queued_in' || s.kind === 'queued_out'
        ? [
            {
              id: s.entryId,
              inInstanceId: s.inInstanceId || (s.kind === 'queued_in' ? s.cardInstanceId : null),
              outInstanceId: s.outInstanceId,
              inTargetCategory: null,
              sortIndex: 0,
              notes: null,
            },
          ]
        : [],
    lookingForEntries:
      s.kind === 'seeking'
        ? [{ id: s.entryId, instanceId: s.cardInstanceId, sortIndex: 0, notes: null }]
        : [],
    coverInstanceId: null,
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SwapQueueApp unified browse', () => {
  it('merges duplicates into one tile with qty badge and keeps face swimlanes', async () => {
    const a = wantSource({ deckId: 'd1', deckName: 'Commander Deck', entryId: 'e1' });
    const b = wantSource({
      deckId: 'd2',
      deckName: 'Other Cmd',
      entryId: 'e2',
      cardInstanceId: 'c2',
      outInstanceId: 'o2',
      inInstanceId: 'c2',
    });
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deckForSource(a), deckForSource(b)],
      sources: [a, b],
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => expect(screen.getAllByText(/Sol Ring/).length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Unified' }));

    const view = screen.getByTestId('queue-tiles-view');
    expect(view).toHaveAttribute('data-unified', 'true');
    expect(screen.getByTestId('swimlane-queued_in')).toBeInTheDocument();
    expect(document.querySelector('.has-qty')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Stacked' }));
    expect(view).toHaveAttribute('data-layout', 'stacked');
    const queuedIn = screen.getByTestId('swimlane-queued_in');
    expect(queuedIn.querySelector('.db-card-stack')).toBeTruthy();
    expect(queuedIn.querySelector('.db-section-title')).toHaveTextContent(/Commander Deck/);
    expect(queuedIn.querySelector('.sq-tile-cat-bar')).toBeNull();
  });

  it('opens interstitial when a unified tile has multiple sources', async () => {
    const a = wantSource({ deckId: 'd1', deckName: 'Commander Deck', entryId: 'e1' });
    const b = wantSource({
      deckId: 'd2',
      deckName: 'Other Cmd',
      entryId: 'e2',
      cardInstanceId: 'c2',
      outInstanceId: 'o2',
      inInstanceId: 'c2',
    });
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deckForSource(a), deckForSource(b)],
      sources: [a, b],
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => expect(screen.getAllByText(/Sol Ring/).length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Unified' }));
    await user.click(screen.getByRole('button', { name: /Sol Ring/ }));

    const interstitial = screen.getByTestId('source-interstitial');
    expect(interstitial).toBeInTheDocument();
    expect(
      within(interstitial).getByText((text) => text.includes('Commander Deck')),
    ).toBeInTheDocument();
    expect(within(interstitial).getByText((text) => text.includes('Other Cmd'))).toBeInTheDocument();
  });

  it('opens edit directly when a unified tile has a single source', async () => {
    const s = wantSource();
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deckForSource(s)],
      sources: [s],
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Unified' }));
    await user.click(screen.getByRole('button', { name: /Sol Ring/ }));

    expect(screen.queryByTestId('source-interstitial')).not.toBeInTheDocument();
    expect(screen.getByTestId('swap-queue-edit')).toBeInTheDocument();
  });
});
