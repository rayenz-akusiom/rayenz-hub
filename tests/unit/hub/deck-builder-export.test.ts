import { describe, it, expect } from 'vitest';
import { applyFormalSwapsToCards } from '../../../packages/shared/src/deck-builder/formal-swaps.ts';
import { buildArchidektImportText } from '../../../packages/web/src/deck-builder/import-export/to-archidekt.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

describe('export', () => {
  it('includes Queued In/Out headers after formal swaps', () => {
    const doc = {
      ...commander,
      formalSwapEntries: [
        { id: 's1', inInstanceId: 'c3', outInstanceId: 'c1', sortIndex: 0, notes: null },
      ],
    };
    const text = buildArchidektImportText(doc);
    expect(text).toContain('[Queued In');
    expect(text).toContain('[Queued Out');
    expect(text).toContain('Counterspell');
    expect(text).toContain('Birds of Paradise');
  });

  it('applyFormalSwaps clears stale membership for unreferenced cards', () => {
    const stale = commander.cards.map((c) =>
      c.instanceId === 'c2'
        ? { ...c, primaryCategory: 'Queued In', categories: ['Queued In'] }
        : c,
    );
    const out = applyFormalSwapsToCards(stale, [], 'commander');
    expect(out.find((c) => c.instanceId === 'c2').primaryCategory).not.toBe('Queued In');
  });
});
