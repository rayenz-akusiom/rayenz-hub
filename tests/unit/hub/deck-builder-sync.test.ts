import { describe, it, expect } from 'vitest';
import {
  mergeDeckDocuments,
  reconcileDeckAfterApiPut,
} from '../../../packages/web/src/deck-builder/store/deck-store.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

describe('deck sync merge', () => {
  it('prefers newer updatedAt', () => {
    const older = { ...commander, updatedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { ...commander, name: 'Newer', updatedAt: '2026-07-01T00:00:00.000Z' };
    expect(mergeDeckDocuments(older, newer)?.name).toBe('Newer');
    expect(mergeDeckDocuments(newer, older)?.name).toBe('Newer');
  });

  it('preserves local category targets when newer remote stripped them', () => {
    const local = {
      ...commander,
      updatedAt: '2026-07-01T00:00:00.000Z',
      categories: [
        { name: 'Creature', includedInDeck: true, includedInPrice: true, target: 12 },
        { name: 'Land', includedInDeck: true, includedInPrice: true, target: 36 },
      ],
    };
    const remote = {
      ...commander,
      name: 'Remote',
      updatedAt: '2026-07-01T00:00:02.000Z',
      categories: [
        { name: 'Creature', includedInDeck: true, includedInPrice: true, target: null },
        { name: 'Land', includedInDeck: true, includedInPrice: true, target: null },
      ],
    };
    const merged = mergeDeckDocuments(local, remote);
    expect(merged?.name).toBe('Remote');
    expect(merged?.categories.find((c) => c.name === 'Creature')?.target).toBe(12);
    expect(merged?.categories.find((c) => c.name === 'Land')?.target).toBe(36);
  });

  it('reconcileDeckAfterApiPut restores targets dropped by API response', () => {
    const local = {
      ...commander,
      categories: [
        { name: 'Creature', includedInDeck: true, includedInPrice: true, target: 12 },
      ],
    };
    const remote = {
      ...commander,
      updatedAt: '2026-07-01T00:00:05.000Z',
      categories: [
        { name: 'Creature', includedInDeck: true, includedInPrice: true, target: null },
      ],
    };
    const reconciled = reconcileDeckAfterApiPut(local, remote);
    expect(reconciled.updatedAt).toBe(remote.updatedAt);
    expect(reconciled.categories[0]?.target).toBe(12);
  });
});
