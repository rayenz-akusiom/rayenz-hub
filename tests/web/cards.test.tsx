import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardFace } from '../../packages/web/src/cards/CardFace';
import {
  CardFaceSessionProvider,
  useCardFaceSession,
} from '../../packages/web/src/cards/CardFaceSession';
import { CardSizePicker } from '../../packages/web/src/cards/CardSizePicker';
import { CARD_SIZE_STORAGE_KEY } from '../../packages/web/src/cards/card-size';
import {
  CardPickerModal,
  resolveFinish,
  type CardPickerItem,
} from '../../packages/web/src/cards/CardPicker';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function SessionProbe({ faceKey }: { faceKey: string }) {
  const session = useCardFaceSession();
  const face = session?.getFace(faceKey) ?? 'front';
  return <span data-testid="face-state">{face}</span>;
}

describe('CardFaceSessionProvider', () => {
  it('remembers face per key across CardFace flips', async () => {
    const user = userEvent.setup();
    render(
      <CardFaceSessionProvider>
        <CardFace
          src="https://example.com/front.jpg"
          backSrc="https://example.com/back.jpg"
          name="Dual Card"
          faceKey="card-1"
          doubleFaced
        />
        <SessionProbe faceKey="card-1" />
      </CardFaceSessionProvider>,
    );

    expect(screen.getByTestId('face-state')).toHaveTextContent('front');
    await user.click(screen.getByRole('button', { name: 'Show back face' }));
    expect(screen.getByTestId('face-state')).toHaveTextContent('back');
  });
});

describe('CardFace', () => {
  it('renders image with alt text', () => {
    render(<CardFace src="https://example.com/card.jpg" name="Lightning Bolt" />);
    expect(screen.getByRole('img', { name: 'Lightning Bolt' })).toHaveAttribute(
      'src',
      'https://example.com/card.jpg',
    );
  });

  it('shows name fallback when no image src', () => {
    render(<CardFace name="Unknown Card" />);
    expect(screen.getByText('Unknown Card')).toHaveClass('db-card-fallback');
  });

  it('shows quantity badge when qty > 1', () => {
    render(<CardFace src="https://example.com/card.jpg" name="Forest" quantity={3} />);
    expect(screen.getByText('×3')).toBeInTheDocument();
  });

  it('shows foil badge when foil is true', () => {
    render(<CardFace src="https://example.com/card.jpg" name="Foil Card" foil />);
    expect(screen.getByLabelText('Foil')).toBeInTheDocument();
  });

  it('flips locally for double-faced cards without session', async () => {
    const user = userEvent.setup();
    render(
      <CardFace
        src="https://example.com/front.jpg"
        backSrc="https://example.com/back.jpg"
        name="Transform"
        doubleFaced
      />,
    );

    const flip = screen.getByRole('button', { name: 'Show back face' });
    expect(flip).toHaveAttribute('aria-pressed', 'false');
    await user.click(flip);
    expect(screen.getByRole('button', { name: 'Show front face' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('CardSizePicker', () => {
  beforeEach(() => {
    localStorage.setItem(CARD_SIZE_STORAGE_KEY, 'M');
  });

  it('renders small, medium, and large size buttons', () => {
    render(<CardSizePicker size="M" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Card size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Small' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Large' })).toBeInTheDocument();
  });

  it('calls onChange when a size is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CardSizePicker size="M" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Large' }));
    expect(onChange).toHaveBeenCalledWith('L');
  });
});

describe('CardPickerModal', () => {
  const items: CardPickerItem[] = [
    { value: 'a', lines: ['Alpha'], imgSrc: 'https://example.com/a.jpg', category: 'Creatures' },
    { value: 'b', lines: ['Beta', '2 MV'], imgSrc: 'https://example.com/b.jpg', category: 'New Set In' },
    { value: 'c', lines: ['Gamma'], category: 'Spells' },
  ];

  it('renders title and card options', () => {
    render(<CardPickerModal config={{ title: 'Pick a card', items }} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Pick a card' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alpha Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta Beta 2 MV' })).toBeInTheDocument();
    expect(screen.getByText('2 MV')).toBeInTheDocument();
  });

  it('invokes onPick and onClose when an option is chosen', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <CardPickerModal
        config={{ items, selectedValue: 'a', onPick }}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Beta Beta 2 MV' }));
    expect(onPick).toHaveBeenCalledWith('b', items[1], { foil: false });
    expect(onClose).toHaveBeenCalled();
  });

  it('groups by category with pinned New Set In header', () => {
    render(
      <CardPickerModal config={{ items, groupByCategory: true }} onClose={() => {}} />,
    );
    expect(screen.getByText('New Set In')).toBeInTheDocument();
    expect(screen.getByText('Creatures')).toBeInTheDocument();
    expect(screen.getByText('Spells')).toBeInTheDocument();
  });

  it('shows foil toggle and passes foil context on pick', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <CardPickerModal
        config={{
          items: [{ value: 'x', lines: ['Shiny'], finishes: ['foil', 'nonfoil'] }],
          showFoilToggle: true,
          foilDefault: true,
          onPick,
        }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByLabelText('Foil')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'No image Shiny' }));
    expect(onPick).toHaveBeenCalledWith('x', expect.any(Object), { foil: true });
  });

  it('closes when Close is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CardPickerModal config={{ items: [] }} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('resolveFinish', () => {
  it('returns foil when toggle is on and finish is available', () => {
    expect(resolveFinish({ finishes: ['foil', 'nonfoil'] }, true)).toBe('foil');
  });

  it('returns nonfoil when foil is unavailable', () => {
    expect(resolveFinish({ finishes: ['nonfoil'] }, true)).toBe('nonfoil');
  });
});
