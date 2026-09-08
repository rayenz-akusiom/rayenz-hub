import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { CreateCommanderDialog } from '../../packages/web/src/deck-builder/commander/CreateCommanderDialog';
import { CreateCollectionDialog } from '../../packages/web/src/deck-builder/collection/CreateCollectionDialog';
import { CreateCubeDialog } from '../../packages/web/src/deck-builder/cube/CreateCubeDialog';
import * as collectionSync from '../../packages/web/src/deck-builder/collection/collection-sync';

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

  it('forces pendragon format and remaps Commander / Lieutenant headers', async () => {
    const user = userEvent.setup();
    render(
      <CreateCommanderDialog
        onClose={onClose}
        onSave={onSave}
        onMismatchWarning={onMismatchWarning}
        forcedFormat="pendragon"
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Import Pendragon deck' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Archidekt import text'), {
      target: {
        value:
          '[Commander]\n1 Knight of the White Orchid\n[Lieutenant]\n1 Sword of Feast and Famine',
      },
    });
    await user.click(screen.getByRole('button', { name: 'Import paste' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const saved = onSave.mock.calls[0][0] as DeckDocument;
    expect(saved.format).toBe('pendragon');
    expect(saved.cards.some((c) => c.primaryCategory === 'Arthur')).toBe(true);
    expect(saved.cards.some((c) => c.primaryCategory === 'Excalibur')).toBe(true);
    expect(saved.cards.some((c) => c.primaryCategory === 'Commander')).toBe(false);
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

describe('CreateCollectionDialog', () => {
  beforeEach(() => {
    onSave.mockClear();
    onClose.mockClear();
    vi.spyOn(collectionSync, 'createCollectionDocument').mockResolvedValue({
      deckId: 'collection-1',
      schemaVersion: 2,
      name: 'Planeswalker Binder',
      description: '',
      format: 'collection',
      ownership: 'owned',
      visibility: 'private',
      archidektId: null,
      archidektUrl: null,
      categories: [],
      cards: [],
      oracle: {},
      formalSwapEntries: [],
      lookingForEntries: [],
      coverInstanceId: null,
      browseViewDefault: 'planeswalker_subtype',
      cardLayoutDefault: 'grid',
      cardSortDefault: 'name_asc',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastArchidektSyncAt: null,
      lastArchidektImportAt: null,
      cubeTargetSize: null,
      collectionTemplate: 'planeswalkers',
      collectionSearch: {
        query: 't:planeswalker',
        defaultQuantity: 1,
        lastSyncedAt: null,
        lastOpenedAt: null,
        latestReleaseDate: null,
        suppressedKeys: [],
      },
      representativeCard: null,
      autoAdjustBasics: false,
    });
  });

  it('creates a collection from a saved Scryfall search', async () => {
    const user = userEvent.setup();
    render(<CreateCollectionDialog onClose={onClose} onSave={onSave} />);

    await user.type(screen.getByLabelText('Name'), 'Planeswalker Binder');
    await user.selectOptions(screen.getByLabelText('Template'), 'planeswalkers');
    await user.type(screen.getByLabelText('Scryfall query'), 't:planeswalker');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(collectionSync.createCollectionDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Planeswalker Binder',
        template: 'planeswalkers',
        query: 't:planeswalker',
        defaultQuantity: 1,
      }),
    );
    const saved = onSave.mock.calls[0][0] as DeckDocument;
    expect(saved.format).toBe('collection');
    expect(saved.collectionTemplate).toBe('planeswalkers');
    expect(onClose).toHaveBeenCalled();
  });
});
