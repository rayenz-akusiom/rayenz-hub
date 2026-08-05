import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildGlanceIncludeSet, glanceFingerprint } from '@rayenz-hub/shared';
import {
  buildEligibleCommanderDeck,
  buildMultiLieutenantCommanderDeck,
} from '../../fixtures/deck-builder/glance-eligible.ts';
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

  it('differs when a different lieutenant highlight is chosen', () => {
    const deck = buildMultiLieutenantCommanderDeck(4);
    const first = buildGlanceIncludeSet(deck, { lieutenantInstanceIds: ['spell-0', 'spell-1'] });
    const second = buildGlanceIncludeSet(deck, { lieutenantInstanceIds: ['spell-2', 'spell-3'] });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(glanceFingerprint(first.includeSet)).not.toBe(glanceFingerprint(second.includeSet));
  });

  it('differs when layout mode changes', () => {
    const deck = buildEligibleCommanderDeck();
    const typeLine = buildGlanceIncludeSet(deck, { mode: 'type_line' });
    const byCategory = buildGlanceIncludeSet(deck, { mode: 'primary_category' });
    expect(typeLine.ok && byCategory.ok).toBe(true);
    if (!typeLine.ok || !byCategory.ok) return;
    expect(glanceFingerprint(typeLine.includeSet)).not.toBe(
      glanceFingerprint(byCategory.includeSet),
    );
  });
});
