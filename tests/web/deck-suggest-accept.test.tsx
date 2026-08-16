import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcceptDialogue } from '../../packages/web/src/deck-suggest/AcceptDialogue';
import type { DeckDocument } from '@rayenz-hub/shared';
import type { Suggestion } from '../../packages/web/src/deck-suggest/types';
import commander from '../fixtures/deck-builder/commander-slice.json';

afterEach(() => {
  cleanup();
});

const suggestion: Suggestion = {
  suggestion_id: 's1',
  action: 'replace',
  card: { name: 'Sol Ring', set_code: 'CMM', collector_number: '1' },
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
  it('offers Swap Queue and Seeking, requires Out for swap, and cancels', async () => {
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

  it('saves Seeking without an Out card', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSeeking).toHaveBeenCalledTimes(1);
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
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText(/Theory decks have read-only queues/i)).toBeInTheDocument();
  });
});
