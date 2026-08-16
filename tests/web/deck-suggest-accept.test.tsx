import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcceptDialogue } from '../../packages/web/src/deck-suggest/AcceptDialogue';
import type { DeckDocument, PrintingFields } from '@rayenz-hub/shared';
import type { Suggestion } from '../../packages/web/src/deck-suggest/types';
import commander from '../fixtures/deck-builder/commander-slice.json';

const samplePrinting: PrintingFields = {
  name: 'Sol Ring',
  scryfallId: 'sr-id',
  setCode: 'CMM',
  collectorNumber: '1',
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
  it('offers Swap Queue and Seeking in a modal, requires Out for swap, and cancels', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSwap = vi.fn();
    const onSeeking = vi.fn();
    render(
      <AcceptDialogue
        suggestion={suggestion}
        deck={deckWithProtected()}
        theory={false}
        protectedCards={['Kept Bear']}
        onCancel={onCancel}
        onSwap={onSwap}
        onSeeking={onSeeking}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Accept suggestion/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Add to Swap Queue/i })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /Mark as Seeking/i })).toBeEnabled();
    expect(screen.queryByRole('option', { name: 'Elf Commander' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Kept Bear' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Forest' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSwap).not.toHaveBeenCalled();
    expect(onSeeking).not.toHaveBeenCalled();
  });

  it('continues to printing picker then saves Seeking', async () => {
    const user = userEvent.setup();
    const onSeeking = vi.fn();
    render(
      <AcceptDialogue
        suggestion={suggestion}
        deck={deckWithProtected()}
        theory={false}
        onCancel={() => {}}
        onSwap={() => {}}
        onSeeking={onSeeking}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Mark as Seeking/i }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('dialog', { name: /Choose printing/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Mark as Seeking/i }));
    expect(onSeeking).toHaveBeenCalledTimes(1);
    expect(onSeeking.mock.calls[0][0]).toMatchObject({
      printing: samplePrinting,
      proxy: true,
    });
  });

  it('continues to printing picker then saves Swap with Out', async () => {
    const user = userEvent.setup();
    const onSwap = vi.fn();
    render(
      <AcceptDialogue
        suggestion={suggestion}
        deck={deckWithProtected()}
        theory={false}
        onCancel={() => {}}
        onSwap={onSwap}
        onSeeking={() => {}}
      />,
    );
    const forest = screen.getByRole('option', { name: 'Forest' }) as HTMLOptionElement;
    await user.selectOptions(screen.getByLabelText('Out card'), forest.value);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /Add to Swap Queue/i }));
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onSwap.mock.calls[0][0]).toBe(forest.value);
    expect(onSwap.mock.calls[0][1]).toMatchObject({
      printing: samplePrinting,
      proxy: true,
    });
  });

  it('disables Swap Queue and Seeking for Theory decks', () => {
    render(
      <AcceptDialogue
        suggestion={suggestion}
        deck={deckWithProtected()}
        theory
        onCancel={() => {}}
        onSwap={() => {}}
        onSeeking={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: /Add to Swap Queue/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Mark as Seeking/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByText(/Theory decks have read-only queues/i)).toBeInTheDocument();
  });
});
