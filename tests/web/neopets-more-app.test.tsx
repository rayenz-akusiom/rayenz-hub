import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NeopetsMoreApp } from '../../packages/web/src/neopets-more/NeopetsMoreApp';
import { MORE_LINKS } from '../../packages/web/src/neopets-more/links';

afterEach(() => {
  cleanup();
});

describe('NeopetsMoreApp', () => {
  it('renders page title', () => {
    render(<NeopetsMoreApp />);
    expect(screen.getByRole('heading', { name: 'Neopets More' })).toBeInTheDocument();
  });

  it('renders every link tile with label and external href', () => {
    render(<NeopetsMoreApp />);

    for (const link of MORE_LINKS) {
      const anchors = screen.getAllByRole('link', { name: link.label });
      expect(anchors.length).toBeGreaterThanOrEqual(1);
      for (const anchor of anchors) {
        expect(anchor).toHaveAttribute('href', link.url);
        expect(anchor).toHaveAttribute('target', '_blank');
        expect(anchor).toHaveAttribute('rel', 'noreferrer');
      }
    }
  });

  it('shows notes for links that have them', () => {
    render(<NeopetsMoreApp />);

    const withNotes = MORE_LINKS.filter((link) => link.note);
    expect(withNotes.length).toBeGreaterThan(0);

    for (const link of withNotes) {
      const tile = screen.getByRole('link', { name: link.label }).closest('.daily-tile');
      expect(tile).not.toBeNull();
      expect(within(tile!).getByText(link.note!)).toBeInTheDocument();
    }
  });

  it('omits note spans for links without notes', () => {
    render(<NeopetsMoreApp />);

    const withoutNotes = MORE_LINKS.filter((link) => !link.note);
    expect(withoutNotes.length).toBeGreaterThan(0);

    for (const link of withoutNotes) {
      const tile = screen.getByRole('link', { name: link.label }).closest('.daily-tile');
      expect(tile).not.toBeNull();
      expect(tile!.querySelector('.text-small')).toBeNull();
    }
  });
});
