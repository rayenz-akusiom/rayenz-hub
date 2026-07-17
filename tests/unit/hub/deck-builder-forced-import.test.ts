import { describe, expect, it } from 'vitest';
import {
  documentFromImportText,
  documentFromArchidektSnapshot,
} from '../../../packages/web/src/deck-builder/import-export/import-deck.ts';

describe('forced-format import', () => {
  it('documentFromImportText forces commander format', () => {
    const doc = documentFromImportText('[Creature]\n1 Sol Ring', {
      name: 'Vintage Cube',
      forcedFormat: 'commander',
    });
    expect(doc.format).toBe('commander');
  });

  it('documentFromImportText forces cube format', () => {
    const doc = documentFromImportText('[Creature]\n1 Sol Ring', {
      name: 'Atraxa Superfriends',
      forcedFormat: 'cube',
    });
    expect(doc.format).toBe('cube');
  });

  it('documentFromArchidektSnapshot forces cube format', () => {
    const doc = documentFromArchidektSnapshot(
      {
        deck_id: 1,
        deck_name: 'Commander Deck',
        cards: [{ id: 1, name: 'Sol Ring', quantity: 1, primary_category: 'Artifact' }],
      },
      null,
      { forcedFormat: 'cube' },
    );
    expect(doc.format).toBe('cube');
  });
});
