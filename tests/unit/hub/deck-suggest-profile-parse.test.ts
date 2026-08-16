import { describe, expect, it } from 'vitest';
import { parseYamlProfile } from '../../../packages/shared/src/suggest/index.ts';

describe('profile intent parse', () => {
  it('omits new keys as empty lists', () => {
    const profile = parseYamlProfile('deck_id: x\nformat: commander\nroles:\n  - id: ramp\n    tags: [ramp]\n');
    expect(profile.typal_types).toEqual([]);
    expect(profile.themes).toEqual([]);
    expect(profile.keyword_interests).toEqual([]);
  });

  it('parses typal, theme, and keyword lists', () => {
    const profile = parseYamlProfile(
      'typal_types:\n  - Elf\nthemes:\n  - tokens\nkeyword_interests:\n  - landfall\n',
    );
    expect(profile.typal_types).toEqual(['Elf']);
    expect(profile.themes).toEqual(['tokens']);
    expect(profile.keyword_interests).toEqual(['landfall']);
  });

  it('ignores unknown keys', () => {
    const profile = parseYamlProfile('notes: human only\nblocked_cards:\n  - Sol Ring\nunknown_future: true\n');
    expect(profile.blocked_cards).toEqual(['Sol Ring']);
  });
});
