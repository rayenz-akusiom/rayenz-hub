import { describe, it, expect } from 'vitest';
import { applyFormalSwapsToCards, buildArchidektImportText } from '@rayenz-hub/shared';
import commander from '../../fixtures/deck-builder/commander-slice.json';

describe('export', () => {
  it('emits per-line categories for every card (no section headers)', () => {
    const text = buildArchidektImportText(commander as never);
    expect(text).toContain('1x Birds of Paradise (m12) 165 [Creature]');
    expect(text).toContain('1x Forest (m12) 246 [Land]');
    expect(text).not.toMatch(/^\[Creature\]/m);
    expect(text).not.toMatch(/^\[Land\]/m);
  });

  it('puts Queued In/Out on card lines after formal swaps', () => {
    const doc = {
      ...commander,
      formalSwapEntries: [
        { id: 's1', inInstanceId: 'c3', outInstanceId: 'c1', sortIndex: 0, notes: null },
      ],
    };
    const text = buildArchidektImportText(doc as never);
    expect(text).toContain('1x Counterspell (mh2) 267 [Queued In{noDeck}{noPrice},Instant]');
    expect(text).toContain('1x Birds of Paradise (m12) 165 [Queued Out{noDeck}{noPrice},Creature]');
    expect(text).not.toMatch(/^\[Queued In/m);
    expect(text).not.toMatch(/^\[Queued Out/m);
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
    const text = buildArchidektImportText(doc as never);
    expect(text).toMatch(/1x Birds of Paradise \(m12\) 165 \[Creature,Proxies\{noPrice\}\]/);
    expect(text).not.toMatch(/^\[Proxies/m);
  });

  it('applyFormalSwaps clears stale membership for unreferenced cards', () => {
    const stale = commander.cards.map((c) =>
      c.instanceId === 'c2'
        ? { ...c, primaryCategory: 'Queued In', categories: ['Queued In'] }
        : c,
    );
    const out = applyFormalSwapsToCards(stale as never, [], 'commander');
    expect(out.find((c) => c.instanceId === 'c2')!.primaryCategory).not.toBe('Queued In');
  });
});
