import { describe, expect, it } from 'vitest';
import {
  applyProfileTemplate,
  parseTemplateConfigValues,
  STORM_THEME_SEEDS,
} from '../../../packages/web/src/profile-builder/profile-templates';
import { unionUnique } from '../../../packages/web/src/profile-builder/yaml-save';

describe('parseTemplateConfigValues', () => {
  it('splits on commas and newlines and dedupes case-insensitively', () => {
    expect(parseTemplateConfigValues('Elf, Wizard\nelf')).toEqual(['Elf', 'Wizard']);
  });

  it('returns empty for blank input', () => {
    expect(parseTemplateConfigValues('  , \n ')).toEqual([]);
  });
});

describe('applyProfileTemplate', () => {
  const empty = { themes: [] as string[], keyword_interests: [] as string[], typal_types: [] as string[] };

  it('merges Storm theme seeds without wiping existing themes', () => {
    const next = applyProfileTemplate(
      { ...empty, themes: ['reanimate'] },
      'storm',
    );
    expect(next.themes).toEqual(['reanimate', ...STORM_THEME_SEEDS]);
    expect(next.keyword_interests).toEqual([]);
    expect(next.typal_types).toEqual([]);
  });

  it('merges Keyword config into keyword_interests', () => {
    const next = applyProfileTemplate(
      { ...empty, keyword_interests: ['cascade'] },
      'keyword',
      { values: 'landfall, Cascade' },
    );
    expect(next.keyword_interests).toEqual(['cascade', 'landfall']);
  });

  it('no-ops Keyword/Typal when config is empty', () => {
    const base = { themes: ['a'], keyword_interests: ['k'], typal_types: ['Elf'] };
    expect(applyProfileTemplate(base, 'keyword', { values: '' })).toEqual(base);
    expect(applyProfileTemplate(base, 'typal', {})).toEqual(base);
  });

  it('merges Typal config into typal_types', () => {
    const next = applyProfileTemplate(
      { ...empty, typal_types: ['Elf'] },
      'typal',
      { values: 'Wizard, Elf' },
    );
    expect(next.typal_types).toEqual(['Elf', 'Wizard']);
  });
});

describe('unionUnique', () => {
  it('unions lists preserving first casing', () => {
    expect(unionUnique(['Storm'], ['storm', 'landfall'])).toEqual(['Storm', 'landfall']);
  });
});
