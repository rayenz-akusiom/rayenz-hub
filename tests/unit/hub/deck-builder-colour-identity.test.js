import { describe, it, expect } from 'vitest';
import {
  colourIdentitySection,
  groupByColourIdentity,
} from '../../../packages/shared/src/deck-builder/colour-identity.ts';

describe('colourIdentitySection', () => {
  it('puts lands in Lands even with colour identity', () => {
    expect(
      colourIdentitySection({
        typeLine: 'Land — Plains Island',
        colourIdentity: ['W', 'U'],
      }),
    ).toBe('Lands');
  });

  it('maps mono colours', () => {
    expect(colourIdentitySection({ typeLine: 'Creature', colourIdentity: ['U'] })).toBe('Blue');
  });

  it('maps multicolor and colorless', () => {
    expect(colourIdentitySection({ typeLine: 'Creature', colourIdentity: ['W', 'U'] })).toBe(
      'Multicolor',
    );
    expect(colourIdentitySection({ typeLine: 'Artifact', colourIdentity: [] })).toBe('Colorless');
  });

  it('groups a cube fixture', async () => {
    const cube = await import('../../fixtures/deck-builder/cube-slice.json');
    const groups = groupByColourIdentity(cube.cards);
    expect(groups.White).toHaveLength(1);
    expect(groups.Lands).toHaveLength(1);
    expect(groups.Colorless).toHaveLength(1);
  });
});
