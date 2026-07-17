import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardFace } from '../../packages/web/src/cards/CardFace';
import { CardFaceSessionProvider } from '../../packages/web/src/cards/CardFaceSession';
import { CardSizePicker } from '../../packages/web/src/cards/CardSizePicker';
import { NeopetsMoreApp } from '../../packages/web/src/neopets-more/NeopetsMoreApp';
import { FormatBadge } from '../../packages/web/src/deck-builder/ui/FormatBadge';

afterEach(() => {
  cleanup();
});

describe('NeopetsMoreApp', () => {
  it('renders the More page heading and link tiles', () => {
    render(<NeopetsMoreApp />);
    expect(screen.getByRole('heading', { name: /Neopets More/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });
});

describe('CardFace', () => {
  it('renders a fallback when no image src is provided', () => {
    render(<CardFace name="Sol Ring" />);
    expect(screen.getByText('Sol Ring')).toBeInTheDocument();
  });

  it('renders a single face image', () => {
    render(<CardFace name="Sol Ring" src="https://example.com/front.jpg" />);
    expect(screen.getByRole('img', { name: 'Sol Ring' })).toHaveAttribute(
      'src',
      'https://example.com/front.jpg',
    );
  });

  it('flips a double-faced card locally', async () => {
    const user = userEvent.setup();
    render(
      <CardFace
        name="Delver of Secrets"
        src="https://example.com/front.jpg"
        backSrc="https://example.com/back.jpg"
        doubleFaced
      />,
    );
    await user.click(screen.getByLabelText(/Show back face/i));
    expect(document.querySelector('.db-card-flipper.is-back')).toBeTruthy();
    await user.click(screen.getByLabelText(/Show front face/i));
    expect(document.querySelector('.db-card-flipper.is-back')).toBeFalsy();
  });

  it('keeps face when child remounts under one provider', async () => {
    const user = userEvent.setup();
    function Shell() {
      const [mounted, setMounted] = useState(true);
      return (
        <CardFaceSessionProvider>
          <button type="button" onClick={() => setMounted((m) => !m)}>
            toggle
          </button>
          {mounted ? (
            <CardFace
              name="DFC"
              faceKey="stable-1"
              src="https://example.com/front.jpg"
              backSrc="https://example.com/back.jpg"
              doubleFaced
            />
          ) : null}
        </CardFaceSessionProvider>
      );
    }
    render(<Shell />);
    await user.click(screen.getByLabelText(/Show back face/i));
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(document.querySelector('.db-card-flipper.is-back')).toBeTruthy();
  });

  it('shows foil and quantity badges', () => {
    render(
      <CardFace name="Sol Ring" src="https://example.com/front.jpg" foil quantity={3} />,
    );
    expect(screen.getByText('×3')).toBeInTheDocument();
    expect(screen.getByLabelText('Foil')).toBeInTheDocument();
  });
});

describe('CardSizePicker', () => {
  it('renders size options and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CardSizePicker size="M" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Small' }));
    expect(onChange).toHaveBeenCalledWith('S');
  });
});

describe('FormatBadge', () => {
  it('renders known formats', () => {
    const { rerender } = render(<FormatBadge format="commander" showLabel />);
    expect(screen.getByText(/commander/i)).toBeInTheDocument();
    rerender(<FormatBadge format="cube" showLabel />);
    expect(screen.getByText(/cube/i)).toBeInTheDocument();
  });
});
