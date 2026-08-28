import type { SetPoolCard, Suggestion } from './types';

export const FOCUS_TAGS_MAX = 5;

export function normalizeFocusTags(tags: string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags || []) {
    const slug = String(raw || '')
      .trim()
      .toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out.slice(0, FOCUS_TAGS_MAX);
}

export function cardOracleTags(card: SetPoolCard): string[] {
  const tags = [...(card.oracle_tags || []), ...(card.tags || [])];
  return tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
}

export function cardMatchesFocus(card: SetPoolCard, focusTags: string[]): boolean {
  const focus = normalizeFocusTags(focusTags);
  if (!focus.length) return true;
  const cardTags = cardOracleTags(card);
  return focus.some((t) => cardTags.includes(t));
}

export function filterSetPoolCardsByFocus(cards: SetPoolCard[], focusTags: string[]): SetPoolCard[] {
  const focus = normalizeFocusTags(focusTags);
  if (!focus.length) return cards;
  return cards.filter((c) => cardMatchesFocus(c, focus));
}

export function filterSuggestionsByFocus(suggestions: Suggestion[], focusTags: string[]): Suggestion[] {
  const focus = normalizeFocusTags(focusTags);
  if (!focus.length) return suggestions;
  return suggestions.filter((s) => {
    if (s.priority_tier === 'swap') return true;
    const card = s.card as SetPoolCard;
    return cardMatchesFocus(card, focus);
  });
}

export function focusKeySuffix(focusTags: string[]): string {
  const focus = normalizeFocusTags(focusTags);
  if (!focus.length) return '';
  return ':focus-' + focus.slice().sort().join('+');
}
