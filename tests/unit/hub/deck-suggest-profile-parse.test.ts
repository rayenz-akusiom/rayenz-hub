import { describe, expect, it } from 'vitest';
import { parseYamlProfile } from '../../../packages/shared/src/suggest/index.ts';

describe('profile intent parse', () => {
  it('omits new keys as empty lists', () => {
    const profile = parseYamlProfile('deck_id: x\nformat: commander\nroles:\n  - id: ramp\n    tags: [ramp]\n');
    expect(profile.typal_types).toEqual([]);
    expect(profile.themes).toEqual([]);
    expect(profile.keyword_interests).toEqual([]);
    expect(profile.art_tags).toEqual([]);
  });

  it('parses typal, theme, keyword, and art lists', () => {
    const profile = parseYamlProfile(
      'typal_types:\n  - Elf\nthemes:\n  - tokens\nkeyword_interests:\n  - landfall\nart_tags:\n  - tree\n',
    );
    expect(profile.typal_types).toEqual(['Elf']);
    expect(profile.themes).toEqual(['tokens']);
    expect(profile.keyword_interests).toEqual(['landfall']);
    expect(profile.art_tags).toEqual(['tree']);
  });

  it('parses representative_cards and profile_tags', () => {
    const profile = parseYamlProfile(
      'representative_cards:\n  - Sol Ring\nprofile_tags:\n  - artifact\n  - mana-production\n',
    );
    expect(profile.representative_cards).toEqual(['Sol Ring']);
    expect(profile.profile_tags).toEqual(['artifact', 'mana-production']);
  });

  it('ignores unknown keys', () => {
    const profile = parseYamlProfile('notes: human only\nblocked_cards:\n  - Sol Ring\nunknown_future: true\n');
    expect(profile.blocked_cards).toEqual(['Sol Ring']);
  });
});
