import { describe, expect, it } from 'vitest';
import { applyDeckPatch } from '@rayenz-hub/shared';
import type { PrintingFields } from '@rayenz-hub/shared';
import { buildSeekingAcceptPatch, buildSwapAcceptPatch } from '../../../packages/web/src/deck-suggest/accept.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';
import type { Suggestion } from '../../../packages/web/src/deck-suggest/types.ts';

const suggestion: Suggestion = {
  suggestion_id: 'cmd-fixture-001',
  action: 'replace',
  card: { name: 'Sol Ring', set_code: 'CMM', collector_number: '1' },
  quantity: 1,
  roles_matched: [],
  confidence: 'high',
  rationale: 'test',
  tags: ['rule:typal_synergy'],
  replaces: [{ name: 'Forest', quantity: 1 }],
  priority_tier: 'normal',
};

const choicePrinting: PrintingFields = {
  name: 'Sol Ring',
  scryfallId: 'print-id',
  setCode: 'C21',
  collectorNumber: '42',
  typeLine: 'Artifact',
  colourIdentity: [],
  layout: 'normal',
  foil: true,
  printedName: null,
  flavorName: null,
  manaValue: 1,
};

describe('suggest accept patches', () => {
  it('builds a completed swap pair', () => {
    const patch = buildSwapAcceptPatch(commander as never, suggestion, 'c2');
    const next = applyDeckPatch(commander as never, patch);
    expect(next.formalSwapEntries.some((e) => e.outInstanceId === 'c2')).toBe(true);
    expect(next.cards.some((c) => c.name === 'Sol Ring')).toBe(true);
  });

  it('builds a Seeking add', () => {
    const patch = buildSeekingAcceptPatch(commander as never, suggestion);
    const next = applyDeckPatch(commander as never, patch);
    expect(next.lookingForEntries.length).toBeGreaterThan(0);
  });

  it('applies printing, foil, and proxy from the picker choice on swap', () => {
    const patch = buildSwapAcceptPatch(commander as never, suggestion, 'c2', {
      printing: choicePrinting,
      proxy: true,
    });
    const next = applyDeckPatch(commander as never, patch);
    const added = next.cards.find((c) => c.scryfallId === 'print-id');
    expect(added).toMatchObject({
      name: 'Sol Ring',
      setCode: 'C21',
      collectorNumber: '42',
      scryfallId: 'print-id',
      foil: true,
      proxy: true,
    });
  });

  it('applies printing, foil, and proxy from the picker choice on seeking', () => {
    const patch = buildSeekingAcceptPatch(commander as never, suggestion, {
      printing: choicePrinting,
      proxy: true,
    });
    const next = applyDeckPatch(commander as never, patch);
    const added = next.cards.find((c) => c.name === 'Sol Ring');
    expect(added).toMatchObject({
      setCode: 'C21',
      collectorNumber: '42',
      scryfallId: 'print-id',
      foil: true,
      proxy: true,
    });
  });

  it('stores inTargetCategory and notes on the formal swap entry', () => {
    const patch = buildSwapAcceptPatch(commander as never, suggestion, 'c2', undefined, {
      inTargetCategory: 'Ramp',
      notes: 'from suggest',
    });
    const next = applyDeckPatch(commander as never, patch);
    const entry = next.formalSwapEntries.find((e) => e.outInstanceId === 'c2');
    expect(entry).toMatchObject({
      inTargetCategory: 'Ramp',
      notes: 'from suggest',
    });
  });
});
