import type { DeckProfile } from './types';

type ListKey =
  | 'protected_cards'
  | 'blocked_cards'
  | 'typal_types'
  | 'themes'
  | 'keyword_interests'
  | 'art_tags'
  | 'tags'
  | 'avoid_tags';

export function parseYamlProfile(text: string): DeckProfile {
  const profile: DeckProfile = {
    roles: [],
    protected_cards: [],
    blocked_cards: [],
    typal_types: [],
    themes: [],
    keyword_interests: [],
    art_tags: [],
    tags: [],
    constraints: {},
  };
  let currentList: ListKey | null = null;
  let inConstraints = false;
  let currentRole: { id: string; priority?: string; tags?: string[]; target_count?: number } | null = null;

  String(text || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === '#') {
        return;
      }
      if (trimmed === 'roles:') {
        currentList = null;
        inConstraints = false;
        return;
      }
      if (trimmed.indexOf('- id:') === 0) {
        currentRole = { id: trimmed.replace('- id:', '').trim(), tags: [] };
        profile.roles!.push(currentRole);
        currentList = null;
        inConstraints = false;
        return;
      }
      if (currentRole && trimmed.indexOf('priority:') === 0) {
        currentRole.priority = trimmed.replace('priority:', '').trim();
        return;
      }
      if (currentRole && trimmed.indexOf('target_count:') === 0) {
        const n = Number(trimmed.replace('target_count:', '').trim());
        if (Number.isFinite(n)) currentRole.target_count = n;
        return;
      }
      if (currentRole && trimmed.indexOf('tags:') === 0) {
        const tagMatch = trimmed.match(/\[(.*)\]/);
        if (tagMatch) {
          currentRole.tags = tagMatch[1]
            .split(',')
            .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        }
        return;
      }
      if (trimmed === 'protected_cards:') {
        currentList = 'protected_cards';
        currentRole = null;
        inConstraints = false;
        return;
      }
      if (trimmed === 'blocked_cards:') {
        currentList = 'blocked_cards';
        currentRole = null;
        inConstraints = false;
        return;
      }
      if (trimmed === 'typal_types:') {
        currentList = 'typal_types';
        currentRole = null;
        inConstraints = false;
        return;
      }
      if (trimmed === 'themes:') {
        currentList = 'themes';
        currentRole = null;
        inConstraints = false;
        return;
      }
      if (trimmed === 'keyword_interests:') {
        currentList = 'keyword_interests';
        currentRole = null;
        inConstraints = false;
        return;
      }
      if (trimmed === 'art_tags:') {
        currentList = 'art_tags';
        currentRole = null;
        inConstraints = false;
        return;
      }
      if (!currentRole && trimmed === 'tags:') {
        currentList = 'tags';
        inConstraints = false;
        return;
      }
      if (!currentRole && trimmed.indexOf('tags:') === 0) {
        const tagMatch = trimmed.match(/\[(.*)\]/);
        if (tagMatch) {
          profile.tags = tagMatch[1]
            .split(',')
            .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        }
        currentList = null;
        inConstraints = false;
        return;
      }
      if (trimmed === 'constraints:') {
        currentList = null;
        currentRole = null;
        inConstraints = true;
        return;
      }
      if (inConstraints && trimmed.indexOf('max_cmc:') === 0) {
        const n = Number(trimmed.replace('max_cmc:', '').trim());
        if (Number.isFinite(n)) profile.constraints!.max_cmc = n;
        return;
      }
      if (inConstraints && trimmed.indexOf('min_cmc:') === 0) {
        const n = Number(trimmed.replace('min_cmc:', '').trim());
        if (Number.isFinite(n)) profile.constraints!.min_cmc = n;
        return;
      }
      if (inConstraints && trimmed === 'avoid_tags:') {
        currentList = 'avoid_tags';
        profile.constraints!.avoid_tags = profile.constraints!.avoid_tags || [];
        return;
      }
      if (trimmed.indexOf('deck_id:') === 0) {
        profile.deck_id = trimmed.replace('deck_id:', '').trim();
        currentList = null;
        currentRole = null;
        inConstraints = false;
        return;
      }
      if (trimmed.indexOf('format:') === 0) {
        profile.format = trimmed.replace('format:', '').trim();
        currentList = null;
        currentRole = null;
        inConstraints = false;
        return;
      }
      if (trimmed.indexOf('- ') === 0 && currentList) {
        const item = trimmed.replace('- ', '').trim().replace(/^['"]|['"]$/g, '');
        if (currentList === 'avoid_tags') {
          profile.constraints!.avoid_tags = profile.constraints!.avoid_tags || [];
          profile.constraints!.avoid_tags.push(item);
        } else {
          profile[currentList]!.push(item);
        }
        return;
      }
      // Unknown key: ignore and stop attaching list items.
      if (trimmed.indexOf(':') >= 0 && trimmed.indexOf('- ') !== 0) {
        currentList = null;
        currentRole = null;
        inConstraints = false;
      }
    });
  return profile;
}
