import { describe, expect, it } from 'vitest';
import { groupCategorySelectOptions } from '../../../packages/shared/src/index.ts';

describe('groupCategorySelectOptions', () => {
  it('puts custom first; Ramp is custom and Land is default for commander', () => {
    const grouped = groupCategorySelectOptions(
      ['Land', 'Ramp', 'Creature', 'Maybeboard', 'Tokens'],
      { format: 'commander', categoryOrder: ['Tokens', 'Ramp'] },
    );
    expect(grouped.custom).toEqual(['Tokens', 'Ramp']);
    expect(grouped.defaults).toEqual(['Land', 'Creature', 'Maybeboard']);
  });

  it('treats Azorius as default and Creature as custom on cube', () => {
    const grouped = groupCategorySelectOptions(
      ['Creature', 'Azorius', 'Ramp', 'Maybeboard', 'White'],
      { format: 'cube', categoryOrder: ['Ramp', 'Creature'] },
    );
    expect(grouped.custom).toEqual(['Ramp', 'Creature']);
    expect(grouped.defaults).toEqual(['White', 'Azorius', 'Maybeboard']);
  });

  it('omits empty groups and dedupes Colorless / Colourless', () => {
    const onlyCustom = groupCategorySelectOptions(['Ramp'], { format: 'commander' });
    expect(onlyCustom.custom).toEqual(['Ramp']);
    expect(onlyCustom.defaults).toEqual([]);

    const onlyDefault = groupCategorySelectOptions(['Land'], { format: 'commander' });
    expect(onlyDefault.custom).toEqual([]);
    expect(onlyDefault.defaults).toEqual(['Land']);

    const cubeColourless = groupCategorySelectOptions(['Colorless', 'Colourless', 'Ramp'], {
      format: 'cube',
    });
    expect(cubeColourless.custom).toEqual(['Ramp']);
    expect(cubeColourless.defaults).toEqual(['Colorless']);
  });
});
