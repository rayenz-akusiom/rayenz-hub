import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardInstance } from '@rayenz-hub/shared';
import { App } from '../../packages/web/src/App';
import { FormatBadge } from '../../packages/web/src/deck-builder/ui/FormatBadge';
import { CardTile } from '../../packages/web/src/deck-builder/browse/CardTile';
import { ExportBar } from '../../packages/web/src/deck-builder/import-export/ExportBar';

vi.mock('../../packages/web/src/SettingsShell', () => ({
  SettingsShell: () => <div data-testid="settings-shell">Settings shell</div>,
}));

function card(
  over: Partial<CardInstance> & Pick<CardInstance, 'name' | 'instanceId' | 'primaryCategory'>,
): CardInstance {
  return {
    quantity: 1,
    categories: [over.primaryCategory],
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    colourIdentity: [],
    typeLine: 'Instant',
    layout: 'normal',
    keywords: null,
    partnerWith: null,
    archidektCardId: null,
    foil: false,
    ...over,
  };
}

afterEach(() => {
  cleanup();
});

describe('App', () => {
  it('renders SettingsShell', () => {
    render(<App />);
    expect(screen.getByTestId('settings-shell')).toBeInTheDocument();
  });
});

describe('FormatBadge', () => {
  it('renders commander format with aria label', () => {
    render(<FormatBadge format="commander" />);
    expect(screen.getByLabelText('Commander')).toBeInTheDocument();
  });

  it('shows text label when showLabel is true', () => {
    render(<FormatBadge format="cube" showLabel />);
    expect(screen.getByText('Cube')).toBeInTheDocument();
  });

  it('renders other format badge', () => {
    render(<FormatBadge format="other" showLabel />);
    expect(screen.getByLabelText('Other')).toBeInTheDocument();
  });
});

describe('CardTile', () => {
  it('renders card button with title and calls onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const bolt = card({
      instanceId: 'inst-1',
      name: 'Lightning Bolt',
      primaryCategory: 'Instants',
      scryfallId: 'abc',
    });

    render(<CardTile card={bolt} onSelect={onSelect} />);

    const tile = screen.getByRole('button', { name: /Lightning Bolt/i });
    expect(tile).toHaveAttribute('title', 'Lightning Bolt');
    await user.click(tile);
    expect(onSelect).toHaveBeenCalledWith(bolt);
  });

  it('marks selected tiles', () => {
    const bolt = card({
      instanceId: 'inst-2',
      name: 'Shock',
      primaryCategory: 'Instants',
    });
    render(<CardTile card={bolt} selected />);
    expect(screen.getByRole('button', { name: /Shock/i })).toHaveClass('is-selected');
  });
});

describe('ExportBar', () => {
  it('renders browse and layout controls with card size picker', () => {
    render(
      <ExportBar
        view="category"
        onViewChange={() => {}}
        layout="stacked"
        onLayoutChange={() => {}}
        cardSort="name_asc"
        onCardSortChange={() => {}}
        cardSize="M"
        onCardSizeChange={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /Browse Categories/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Layout Stacked/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sort A–Z/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Card size' })).toBeInTheDocument();
  });

  it('changes browse view via menu', async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    render(
      <ExportBar
        view="category"
        onViewChange={onViewChange}
        layout="stacked"
        onLayoutChange={() => {}}
        cardSort="name_asc"
        onCardSortChange={() => {}}
        cardSize="M"
        onCardSizeChange={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Browse Categories/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Colour identity' }));
    expect(onViewChange).toHaveBeenCalledWith('colour_identity');
  });
});
