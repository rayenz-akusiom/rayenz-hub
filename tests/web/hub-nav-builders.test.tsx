import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HubNav } from '../../packages/web/src/hub/HubNav';

afterEach(() => {
  cleanup();
});

describe('HubNav builder entries', () => {
  it('renders Commander Builder and Cube Builder links', () => {
    render(<HubNav path="/dailies" open={false} onClose={() => {}} />);
    expect(screen.getByRole('link', { name: 'Commander Builder' })).toHaveAttribute(
      'href',
      '#/commander-builder',
    );
    expect(screen.getByRole('link', { name: 'Cube Builder' })).toHaveAttribute(
      'href',
      '#/cube-builder',
    );
    expect(screen.queryByRole('link', { name: 'Deck Builder' })).not.toBeInTheDocument();
  });

  it('marks commander builder active on nested deep link path', () => {
    render(<HubNav path="/commander-builder" open={false} onClose={() => {}} />);
    expect(screen.getByRole('link', { name: 'Commander Builder' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Cube Builder' })).not.toHaveClass('active');
  });

  it('marks cube builder active on nested path', () => {
    render(<HubNav path="/cube-builder" open={false} onClose={() => {}} />);
    expect(screen.getByRole('link', { name: 'Cube Builder' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Commander Builder' })).not.toHaveClass('active');
  });
});
