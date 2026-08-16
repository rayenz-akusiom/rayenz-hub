import { describe, expect, it } from 'vitest';
import { applyDeckPatch } from '@rayenz-hub/shared';
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
});
