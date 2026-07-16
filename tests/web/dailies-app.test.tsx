import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailiesApp } from '../../packages/web/src/dailies/DailiesApp';

describe('DailiesApp', () => {
  it('renders the dailies page chrome', () => {
    render(<DailiesApp />);
    expect(screen.getByRole('heading', { name: /Rayenz's Dailies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open settings/i })).toBeInTheDocument();
  });
});
