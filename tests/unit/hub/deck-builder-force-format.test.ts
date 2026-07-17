import { describe, expect, it } from 'vitest';
import { applyForcedFormat } from '../../../packages/shared/src/deck-builder/force-format.ts';
import type { DeckDocument } from '../../../packages/shared/src/schemas/deck-builder.ts';

function baseDoc(overrides: Partial<DeckDocument> = {}): DeckDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    deckId: 'deck-1',
    name: 'Test Deck',
    format: 'commander',
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards: [],
    oracle: {},
    formalSwapEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: now,
    updatedAt: now,
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
    ...overrides,
  };
}

describe('applyForcedFormat', () => {
  it('forces commander format without warning when already commander', () => {
    const doc = baseDoc({ name: 'My Commander', format: 'commander' });
    const { document, formatMismatchWarning } = applyForcedFormat(doc, 'commander');
    expect(document.format).toBe('commander');
    expect(formatMismatchWarning).toBeNull();
  });

  it('forces cube format and warns when name suggests commander', () => {
    const doc = baseDoc({ name: 'Atraxa Superfriends', format: 'commander' });
    const { document, formatMismatchWarning } = applyForcedFormat(doc, 'cube');
    expect(document.format).toBe('cube');
    expect(formatMismatchWarning).toMatch(/commander.*cube/i);
  });

  it('forces commander format and warns when name suggests cube', () => {
    const doc = baseDoc({ name: 'Vintage Cube', format: 'cube' });
    const { document, formatMismatchWarning } = applyForcedFormat(doc, 'commander');
    expect(document.format).toBe('commander');
    expect(formatMismatchWarning).toMatch(/cube.*commander/i);
  });

  it('always sets format to forced value', () => {
    const doc = baseDoc({ name: 'Neutral Deck', format: 'other' });
    const { document } = applyForcedFormat(doc, 'cube');
    expect(document.format).toBe('cube');
  });
});
