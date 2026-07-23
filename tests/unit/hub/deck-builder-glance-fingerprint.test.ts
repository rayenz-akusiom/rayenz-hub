import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildGlanceIncludeSet, glanceFingerprint } from '@rayenz-hub/shared';
import { buildEligibleCommanderDeck } from '../../fixtures/deck-builder/glance-eligible.ts';
import { sha256Hex } from '../../../packages/shared/src/deck-builder/glance/sha256.ts';

describe('deck-builder glance fingerprint', () => {
  it('sha256Hex matches node:crypto for UTF-8 material', () => {
    for (const sample of ['', 'abc', 'glance-layout-1\ncard|x', '🚀']) {
      expect(sha256Hex(sample)).toBe(createHash('sha256').update(sample, 'utf8').digest('hex'));
    }
  });

  it('is stable for the same include-set', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    expect(glanceFingerprint(include.includeSet)).toBe(glanceFingerprint(include.includeSet));
  });
});
