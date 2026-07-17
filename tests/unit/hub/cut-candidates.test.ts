import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CutCandidates } from '@rayenz-hub/shared';
import { resetHubModules } from '../helpers/hubHarness.ts';

function commanderSnapshot() {
  return {
    cards: [
      { name: 'New Card', primary_category: 'New Set In', quantity: 1, set_code: 'nin', collector_number: '1' },
      { name: 'Cut Card', primary_category: 'New Set Out', quantity: 1, set_code: 'nout', collector_number: '1' },
      { name: 'Sol Ring', primary_category: 'Ramp', quantity: 1, set_code: 'cmm', collector_number: '1' },
      { name: 'Stash Me', primary_category: 'Maybeboard', quantity: 1, set_code: 'mb', collector_number: '9' },
      { name: 'Atraxa', primary_category: 'Commander', quantity: 1, set_code: 'c16', collector_number: '1' },
    ],
  };
}

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('CutCandidates.buildCutCandidates', () => {
  it('excludes swap-queue and commander categories from main deck scan', () => {
    const names = CutCandidates.buildCutCandidates(commanderSnapshot()).map((o) => o.name);
    expect(names).toContain('Sol Ring');
    expect(names).not.toContain('New Card');
    expect(names).not.toContain('Cut Card');
    expect(names).not.toContain('Atraxa');
  });

  it('excludeMaybeboard removes maybeboard cards', () => {
    const names = CutCandidates.buildCutCandidates(commanderSnapshot(), {
      excludeMaybeboard: true,
    }).map((o) => o.name);
    expect(names).not.toContain('Stash Me');
    expect(names).toContain('Sol Ring');
  });

  it('includeOutQueue prepends New Set Out cards', () => {
    const names = CutCandidates.buildCutCandidates(commanderSnapshot(), {
      includeOutQueue: true,
    }).map((o) => o.name);
    expect(names[0]).toBe('Cut Card');
    expect(names).toContain('Sol Ring');
  });

  it('outQueueFallback adds out queue when main scan empty', () => {
    const snap = {
      cards: [
        { name: 'New Card', primary_category: 'New Set In', quantity: 1 },
        { name: 'Cut Card', primary_category: 'New Set Out', quantity: 1 },
        { name: 'Atraxa', primary_category: 'Commander', quantity: 1 },
      ],
    };
    const names = CutCandidates.buildCutCandidates(snap, { outQueueFallback: true }).map((o) => o.name);
    expect(names).toEqual(['Cut Card']);
  });

  it('categoryFilter limits to one category', () => {
    const names = CutCandidates.buildCutCandidates(commanderSnapshot(), {
      categoryFilter: 'Ramp',
    }).map((o) => o.name);
    expect(names).toEqual(['Sol Ring']);
  });

  it('accepts deck wrapper with deck_snapshot', () => {
    const names = CutCandidates.buildCutCandidates({ deck_snapshot: commanderSnapshot() }).map(
      (o) => o.name,
    );
    expect(names).toContain('Sol Ring');
  });

  it('sortByName sorts alphabetically', () => {
    const snap = {
      cards: [
        { name: 'Zebra', primary_category: 'Ramp' },
        { name: 'Alpha', primary_category: 'Ramp' },
      ],
    };
    const names = CutCandidates.buildCutCandidates(snap, { sortByName: true }).map((o) => o.name);
    expect(names).toEqual(['Alpha', 'Zebra']);
  });

  it('extraCards appends unique options', () => {
    const names = CutCandidates.buildCutCandidates(commanderSnapshot(), {
      extraCards: [{ name: 'Extra', primary_category: 'Ramp' }],
    }).map((o) => o.name);
    expect(names).toContain('Extra');
  });

  it('dedupes by optionKey', () => {
    const snap = {
      cards: [
        { name: 'Sol Ring', primary_category: 'Ramp', set_code: 'cmm', collector_number: '1' },
        { name: 'Sol Ring', primary_category: 'Ramp', set_code: 'cmm', collector_number: '1' },
      ],
    };
    expect(CutCandidates.buildCutCandidates(snap)).toHaveLength(1);
  });

  it('returns empty for missing snapshot', () => {
    expect(CutCandidates.buildCutCandidates(null)).toEqual([]);
    expect(CutCandidates.buildCutCandidates({})).toEqual([]);
  });
});
