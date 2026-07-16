import { describe, it, expect } from 'vitest';
import { mergeDeckDocuments } from '../../../packages/web/src/deck-builder/store/deck-store.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

describe('deck sync merge', () => {
  it('prefers newer updatedAt', () => {
    const older = { ...commander, updatedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { ...commander, name: 'Newer', updatedAt: '2026-07-01T00:00:00.000Z' };
    expect(mergeDeckDocuments(older, newer)?.name).toBe('Newer');
    expect(mergeDeckDocuments(newer, older)?.name).toBe('Newer');
  });
});
