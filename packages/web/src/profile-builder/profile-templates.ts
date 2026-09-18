export type ProfileTemplateId = 'keyword' | 'storm' | 'typal';

export type ProfileIntentLists = {
  themes: string[];
  keyword_interests: string[];
  typal_types: string[];
};

export type ProfileTemplateConfig = {
  /** Comma / newline / whitespace-separated tokens for Keyword or Typal templates. */
  values?: string;
};

export const STORM_THEME_SEEDS = ['storm-count-matters', 'storm-like'] as const;

export const PROFILE_TEMPLATES: Array<{
  id: ProfileTemplateId;
  label: string;
  description: string;
  needsConfig: boolean;
  configLabel?: string;
  configPlaceholder?: string;
}> = [
  {
    id: 'keyword',
    label: 'Keyword',
    description: 'Seed keyword_interests with printed mechanics (e.g. landfall, cascade).',
    needsConfig: true,
    configLabel: 'Keywords',
    configPlaceholder: 'landfall, cascade',
  },
  {
    id: 'storm',
    label: 'Storm',
    description: 'Seed themes with storm-count-matters and storm-like.',
    needsConfig: false,
  },
  {
    id: 'typal',
    label: 'Typal',
    description: 'Seed typal_types with creature (or other) subtypes.',
    needsConfig: true,
    configLabel: 'Types',
    configPlaceholder: 'Elf, Wizard',
  },
];

/** Split free-text config into unique trimmed tokens (order preserved). */
export function parseTemplateConfigValues(raw: string | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw || '').split(/[\n,]+/)) {
    const token = part.trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function mergeUnique(existing: string[], additions: string[]): string[] {
  const seen = new Set(existing.map((t) => t.toLowerCase()));
  const out = [...existing];
  for (const item of additions) {
    const trimmed = String(item).trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Merge a template into intent lists. Does not mutate input.
 * Keyword/Typal require config values; Storm needs none.
 */
export function applyProfileTemplate(
  state: ProfileIntentLists,
  templateId: ProfileTemplateId,
  config: ProfileTemplateConfig = {},
): ProfileIntentLists {
  const next: ProfileIntentLists = {
    themes: [...state.themes],
    keyword_interests: [...state.keyword_interests],
    typal_types: [...state.typal_types],
  };

  if (templateId === 'storm') {
    next.themes = mergeUnique(next.themes, [...STORM_THEME_SEEDS]);
    return next;
  }

  const values = parseTemplateConfigValues(config.values);
  if (!values.length) return next;

  if (templateId === 'keyword') {
    next.keyword_interests = mergeUnique(next.keyword_interests, values);
    return next;
  }

  next.typal_types = mergeUnique(next.typal_types, values);
  return next;
}
