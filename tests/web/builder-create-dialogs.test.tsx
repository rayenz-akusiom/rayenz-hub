import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { CreateCommanderDialog } from '../../packages/web/src/deck-builder/commander/CreateCommanderDialog';
import { CreateCubeDialog } from '../../packages/web/src/deck-builder/cube/CreateCubeDialog';

const onSave = vi.fn(async (_doc: DeckDocument) => {});
const onClose = vi.fn();
const onMismatchWarning = vi.fn();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CreateCommanderDialog', () => {
  beforeEach(() => {
    onSave.mockClear();
    onClose.mockClear();
    onMismatchWarning.mockClear();
  });

  it('forces commander format on paste import and warns on cube-like name', async () => {
    const user = userEvent.setup();
    render(
      <CreateCommanderDialog
        onClose={onClose}
        onSave={onSave}
        onMismatchWarning={onMismatchWarning}
      />,
    );

    await user.type(screen.getByLabelText('Name (optional)'), 'Vintage Cube');
    await user.type(screen.getByLabelText('Archidekt import text'), '[Artifact]\n1 Sol Ring');
    await user.click(screen.getByRole('button', { name: 'Import paste' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const saved = onSave.mock.calls[0][0] as DeckDocument;
    expect(saved.format).toBe('commander');
    expect(onMismatchWarning).toHaveBeenCalledWith(expect.stringMatching(/cube.*commander/i));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CreateCubeDialog', () => {
  beforeEach(() => {
    onSave.mockClear();
    onClose.mockClear();
    onMismatchWarning.mockClear();
  });

  it('creates empty cube with target size and categories', async () => {
    const user = userEvent.setup();
    render(
      <CreateCubeDialog onClose={onClose} onSave={onSave} onMismatchWarning={onMismatchWarning} />,
    );

    await user.type(screen.getByLabelText('Name'), 'My Cube');
    await user.clear(screen.getByLabelText('Target size'));
    await user.type(screen.getByLabelText('Target size'), '450');
    await user.click(screen.getByRole('button', { name: 'Create empty cube' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const saved = onSave.mock.calls[0][0] as DeckDocument;
    expect(saved.format).toBe('cube');
    expect(saved.name).toBe('My Cube');
    expect(saved.cubeTargetSize).toBe(450);
    expect(saved.browseViewDefault).toBe('colour_identity');
    expect(saved.categories.some((c) => c.name === 'White')).toBe(true);
    expect(saved.categories.some((c) => c.name === 'Maybeboard')).toBe(true);
  });

  it('forces cube format on paste import', async () => {
    const user = userEvent.setup();
    render(
      <CreateCubeDialog onClose={onClose} onSave={onSave} onMismatchWarning={onMismatchWarning} />,
    );

    await user.type(screen.getByLabelText('Archidekt import text (optional)'), '[Artifact]\n1 Sol Ring');
    await user.click(screen.getByRole('button', { name: 'Import paste' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const saved = onSave.mock.calls[0][0] as DeckDocument;
    expect(saved.format).toBe('cube');
    expect(saved.browseViewDefault).toBe('colour_identity');
  });
});
