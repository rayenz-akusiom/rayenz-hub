import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregateSwapWants, SWAP_GLANCE_GENERATION_VERSION } from '@rayenz-hub/shared';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';
import { SwapsGlanceDialog } from '../../packages/web/src/swap-queue/SwapsGlanceDialog';
import { buildGlanceSwapCommanderDeck } from '../fixtures/deck-builder/glance-eligible.ts';
import { stubGlanceObjectUrls } from './helpers/glance-stub.ts';
import { clearHubAuthSession, setHubAuthSession } from '../../packages/web/src/lib/hub-auth-session';

const apiConfigured = vi.hoisted(() => ({ value: true }));
const postSwapsGlance = vi.hoisted(() =>
  vi.fn(async () => ({
    blobs: [new Blob(['png'], { type: 'image/png' })],
    pageCount: 1,
    densifyStage: 'base',
    omittedCardCount: 0,
    cache: 'MISS',
    generation: 'swap-glance-gen-9',
    delivery: 'inline' as const,
  })),
);
vi.mock('../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => apiConfigured.value,
}));

vi.mock('../../packages/web/src/swap-queue/swaps-glance-api', () => ({
  apiPostSwapsGlance: (...args: unknown[]) => postSwapsGlance(...args),
}));

const mockLoadSwapWantSources = vi.fn();

vi.mock('../../packages/web/src/swap-queue/aggregate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/web/src/swap-queue/aggregate')>();
  return {
    ...actual,
    loadSwapWantSources: () => mockLoadSwapWantSources(),
  };
});

vi.mock('../../packages/web/src/swap-queue/export-ui', () => ({
  copyArchidektWants: vi.fn(async () => true),
  copyNameQtyWants: vi.fn(async () => true),
  copyText: vi.fn(async () => true),
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-store', () => ({
  saveDeck: vi.fn(),
}));

vi.mock('../../packages/web/src/deck-builder/store/library-sync', () => ({
  pullRemoteLibraryUpdates: vi.fn(async () => []),
}));

vi.mock('../../packages/web/src/swap-queue/enrich-prices', () => ({
  enrichWantSourcesUsd: async (sources: unknown) => sources,
}));

vi.mock('../../packages/web/src/swap-queue/fx-cad', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/web/src/swap-queue/fx-cad')>();
  return {
    ...actual,
    fetchFxUsdCad: async () => ({ rate: 1.35, date: '2026-08-14' }),
  };
});

afterEach(() => {
  cleanup();
  apiConfigured.value = true;
  vi.clearAllMocks();
  clearHubAuthSession();
  window.location.hash = '';
});

describe('Swaps at a glance dialog', () => {
  beforeEach(() => {
    window.location.hash = '';
    setHubAuthSession({ accessToken: 't', username: 'Rayenz', isOwner: true });
    const deck = buildGlanceSwapCommanderDeck({
      deckId: 'sq-glance',
      lookingForEntries: [{ id: 'seek-1', instanceId: 'spell-1', sortIndex: 0, notes: null }],
    });
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    stubGlanceObjectUrls('blob:swaps-glance-preview');
    postSwapsGlance.mockImplementation(async () => ({
      blobs: [new Blob(['png'], { type: 'image/png' })],
      pageCount: 1,
      densifyStage: 'base',
      omittedCardCount: 0,
      cache: 'MISS',
      generation: SWAP_GLANCE_GENERATION_VERSION,
      delivery: 'inline' as const,
    }));
  });

  it('opens from Actions and updates row count when Seeking is toggled', async () => {
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => expect(screen.getByText(/Swap In Spell/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Swaps at a glance…' }));

    expect(await screen.findByRole('dialog', { name: 'Swaps at a glance' })).toBeInTheDocument();
    expect(screen.getByText(/2 rows from current filters/i)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /include seeking/i }));
    expect(screen.getByText(/1 row from current filters/i)).toBeInTheDocument();
  });

  it('generates a preview via the Hub API', async () => {
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => expect(screen.getByText(/Swap In Spell/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Swaps at a glance…' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(postSwapsGlance).toHaveBeenCalled());
    expect(postSwapsGlance).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'in_only',
        includeSeeking: true,
        items: expect.arrayContaining([
          expect.objectContaining({ kind: 'queued_in', entryId: 'swap-1' }),
          expect.objectContaining({ kind: 'seeking', entryId: 'seek-1' }),
        ]),
      }),
    );
    expect(
      await screen.findByRole('img', { name: 'Swaps at a glance preview' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  it('posts setCodes when provided', async () => {
    const user = userEvent.setup();
    const deck = buildGlanceSwapCommanderDeck({ deckId: 'sq-glance-sets' });
    const sources = aggregateSwapWants([deck]).filter((s) => s.kind === 'queued_in');
    render(
      <SwapsGlanceDialog
        open
        sources={sources}
        setCodes={['MH3', 'MSC']}
        onClose={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(postSwapsGlance).toHaveBeenCalled());
    expect(postSwapsGlance).toHaveBeenCalledWith(
      expect.objectContaining({
        setCodes: ['MH3', 'MSC'],
        mode: 'in_only',
      }),
    );
  });

  it('shows a carousel and Download all for multi-image results', async () => {
    postSwapsGlance.mockResolvedValueOnce({
      blobs: [
        new Blob(['png1'], { type: 'image/png' }),
        new Blob(['png2'], { type: 'image/png' }),
      ],
      pageCount: 2,
      densifyStage: 'base',
      omittedCardCount: 0,
      cache: 'MISS',
      generation: SWAP_GLANCE_GENERATION_VERSION,
      delivery: 'bundle' as const,
    });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => `blob:preview-${blob.size}`),
      revokeObjectURL: vi.fn(),
    });

    const user = userEvent.setup();
    const deck = buildGlanceSwapCommanderDeck({ deckId: 'sq-glance-multi' });
    const sources = aggregateSwapWants([deck]).filter((s) => s.kind === 'queued_in');
    render(<SwapsGlanceDialog open sources={sources} onClose={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(
      await screen.findByRole('img', { name: /Swaps at a glance preview 1 of 2/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download all' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByRole('img', { name: /Swaps at a glance preview 2 of 2/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('omits Swaps at a glance for a non-owner session', async () => {
    window.location.hash = '';
    setHubAuthSession({ accessToken: 't', username: 'friend', isOwner: false });
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => expect(screen.getByText(/Swap In Spell/)).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Swaps at a glance…' })).not.toBeInTheDocument();
  });
});
