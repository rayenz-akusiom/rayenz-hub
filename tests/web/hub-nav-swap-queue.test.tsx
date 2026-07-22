import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HubNav } from '../../packages/web/src/hub/HubNav';

afterEach(() => {
  cleanup();
});

describe('HubNav Swap Queue entry', () => {
  it('renders a Swap Queue link to #/swap-queue', () => {
    render(<HubNav path="/dailies" open={false} onClose={() => {}} />);
    expect(screen.getByRole('link', { name: 'Swap Queue' })).toHaveAttribute(
      'href',
      '#/swap-queue',
    );
  });

  it('does not render a separate Wishlist nav item', () => {
    render(<HubNav path="/dailies" open={false} onClose={() => {}} />);
    expect(screen.queryByRole('link', { name: 'Wishlist' })).not.toBeInTheDocument();
  });

  it('places Swap Queue directly under Cube Builder', () => {
    render(<HubNav path="/dailies" open={false} onClose={() => {}} />);
    const links = screen.getAllByRole('link').map((a) => a.textContent?.trim());
    const cube = links.indexOf('Cube Builder');
    const swap = links.indexOf('Swap Queue');
    expect(cube).toBeGreaterThanOrEqual(0);
    expect(swap).toBe(cube + 1);
  });

  it('marks Swap Queue active on its own path', () => {
    render(<HubNav path="/swap-queue" open={false} onClose={() => {}} />);
    expect(screen.getByRole('link', { name: 'Swap Queue' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Deck Suggest' })).not.toHaveClass('active');
  });

  it('does not mark Swap Queue active on the wishlist path (no nav item for it)', () => {
    render(<HubNav path="/wishlist" open={false} onClose={() => {}} />);
    expect(screen.getByRole('link', { name: 'Swap Queue' })).not.toHaveClass('active');
  });
});
