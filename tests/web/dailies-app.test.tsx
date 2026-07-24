import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DailiesApp } from '../../packages/web/src/dailies/DailiesApp';

afterEach(() => {
  cleanup();
});

describe('DailiesApp', () => {
  it('renders the dailies page chrome', () => {
    render(<DailiesApp />);
    expect(screen.getByRole('heading', { name: /Rayenz's Dailies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open settings/i })).toBeInTheDocument();
  });

  it('shows a Wishlists refresh button', () => {
    render(<DailiesApp />);
    expect(screen.getByRole('heading', { name: 'Wishlists' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
