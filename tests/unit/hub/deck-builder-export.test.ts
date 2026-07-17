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

  it('emits Proxies as secondary inline category for proxy cards', () => {
    const doc = {
      ...commander,
      cards: commander.cards.map((c) =>
        c.instanceId === 'c1' ? { ...c, proxy: true } : { ...c, proxy: false },
      ),
      categories: [
        ...commander.categories,
        { name: 'Proxies', includedInDeck: true, includedInPrice: false },
      ],
    };
    const text = buildArchidektImportText(doc);
    expect(text).toMatch(/1 Birds of Paradise \(m12\) 165 \[Creature,Proxies\{noPrice\}\]/);
    expect(text).not.toMatch(/^\[Proxies/m);
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
