import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcceptDialogue } from '../../packages/web/src/deck-suggest/AcceptDialogue';
import type { DeckDocument, PrintingFields } from '@rayenz-hub/shared';
import type { Suggestion } from '../../packages/web/src/deck-suggest/types';
import commander from '../fixtures/deck-builder/commander-slice.json';

const samplePrinting: PrintingFields = {
  name: 'Sol Ring',
  scryfallId: 'picked-print-id',
  setCode: 'C21',
  collectorNumber: '42',
  typeLine: 'Artifact',
  colourIdentity: [],
  layout: 'normal',
  foil: true,
  printedName: null,
  flavorName: null,
  manaValue: 1,
};

vi.mock('../../packages/web/src/deck-builder/scryfall/PrintingPickerModal', () => ({
  PrintingPickerModal: ({
    confirmLabel,
    onConfirm,
    onClose,
    onBack,
  }: {
    confirmLabel?: string;
    onConfirm: (printing: PrintingFields, category?: string, meta?: { proxy: boolean }) => void;
    onClose: () => void;
    onBack?: () => void;
  }) => (
    <div role="dialog" aria-label="Choose printing">
      <button
        type="button"
        onClick={() => onConfirm(samplePrinting, undefined, { proxy: true })}
      >
        {confirmLabel || 'Confirm'}
      </button>
      {onBack ? (
        <button type="button" onClick={onBack}>
          Back
        </button>
      ) : null}
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

const suggestion: Suggestion = {
  suggestion_id: 's1',
  action: 'replace',
  card: { name: 'Sol Ring', set_code: 'CMM', collector_number: '1', scryfall_id: 'sr-id' },
  quantity: 1,
  roles_matched: [],
  confidence: 'high',
  rationale: 'test',
  tags: ['rule:typal_synergy'],
  replaces: [{ name: 'Forest', quantity: 1 }],
  priority_tier: 'normal',
};

function deckWithProtected(): DeckDocument {
  const base = commander as unknown as DeckDocument;
  const sample = base.cards[0];
  return {
    ...base,
    cards: [
      {
        ...sample,
        instanceId: 'cmd',
        name: 'Elf Commander',
        primaryCategory: 'Commander',
        categories: ['Commander'],
      },
      ...base.cards,
      {
        ...sample,
        instanceId: 'prot',
        name: 'Kept Bear',
        primaryCategory: 'Creature',
        categories: ['Creature'],
      },
    ],
  };
}

describe('AcceptDialogue', () => {
  it('hosts SwapEditChrome with Seeking tab, real In CardTile, and cancels', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSwap = vi.fn();
    const onSeeking = vi.fn();
    render(
      <AcceptDialogue
        suggestion={suggestion}
        deck={deckWithProtected()}
        protectedCards={['Kept Bear']}
        onCancel={onCancel}
        onSwap={onSwap}
        onSeeking={onSeeking}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Accept suggestion/i })).toBeInTheDocument();
    expect(screen.getByTestId('swap-queue-edit')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Swap' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Add to Seeking' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change In' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /In: Sol Ring/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to Swap Queue' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSwap).not.toHaveBeenCalled();
    expect(onSeeking).not.toHaveBeenCalled();
  });

  it('requires Out before accepting a swap', async () => {
    const user = userEvent.setup();
    const onSwap = vi.fn();
    const deck = deckWithProtected();
    const noPrefill: Suggestion = { ...suggestion, replaces: [] };
    render(
      <AcceptDialogue
        suggestion={noPrefill}
        deck={deck}
        onCancel={() => {}}
        onSwap={onSwap}
        onSeeking={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add to Swap Queue' })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: 'Add to Seeking' }));
    expect(screen.getByRole('button', { name: 'Add to Seeking' })).toBeEnabled();
  });

  it('accepts Seeking from CTA using suggestion printing without opening picker', async () => {
    const user = userEvent.setup();
    const onSeeking = vi.fn();
    render(
      <AcceptDialogue
        suggestion={suggestion}
        deck={deckWithProtected()}
        onCancel={() => {}}
        onSwap={() => {}}
        onSeeking={onSeeking}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'Add to Seeking' }));
    await user.click(screen.getByRole('button', { name: 'Add to Seeking' }));
    expect(screen.queryByRole('dialog', { name: 'Choose printing' })).not.toBeInTheDocument();
    expect(onSeeking).toHaveBeenCalledTimes(1);
    expect(onSeeking.mock.calls[0][0]).toMatchObject({
      printing: {
        name: 'Sol Ring',
        scryfallId: 'sr-id',
        setCode: 'CMM',
        collectorNumber: '1',
      },
      proxy: false,
    });
  });

  it('accepts Swap from CTA using suggestion printing when Out is prefilled', async () => {
    const user = userEvent.setup();
    const onSwap = vi.fn();
    const deck = deckWithProtected();
    const forest = deck.cards.find((c) => c.name === 'Forest');
    expect(forest).toBeTruthy();
    render(
      <AcceptDialogue
        suggestion={suggestion}
        deck={deck}
        onCancel={() => {}}
        onSwap={onSwap}
        onSeeking={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add to Swap Queue' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Add to Swap Queue' }));
    expect(screen.queryByRole('dialog', { name: 'Choose printing' })).not.toBeInTheDocument();
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onSwap.mock.calls[0][0]).toBe(forest!.instanceId);
    expect(onSwap.mock.calls[0][1]).toMatchObject({
      printing: {
        name: 'Sol Ring',
        scryfallId: 'sr-id',
        setCode: 'CMM',
        collectorNumber: '1',
      },
      proxy: false,
    });
  });

  it('lets Change In update printing, then CTA accepts with that printing', async () => {
    const user = userEvent.setup();
    const onSwap = vi.fn();
    const deck = deckWithProtected();
    const forest = deck.cards.find((c) => c.name === 'Forest');
    render(
      <AcceptDialogue
        suggestion={suggestion}
        deck={deck}
        onCancel={() => {}}
        onSwap={onSwap}
        onSeeking={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Change In' }));
    expect(screen.getByRole('dialog', { name: 'Choose printing' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use printing' }));
    expect(screen.getByTestId('swap-queue-edit')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add to Swap Queue' }));
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onSwap.mock.calls[0][0]).toBe(forest!.instanceId);
    expect(onSwap.mock.calls[0][1]).toMatchObject({
      printing: samplePrinting,
      proxy: true,
    });
  });
});
