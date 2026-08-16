import type { DeckProfile, DeckRecord, SetScope, Suggestion, TaggerContext } from './types';
import { cardStoredTags, cardTextBlob } from './signals';
import { eligibleSetCards, emitSynergyHits } from './synergy-emit';

export function runThemeSynergy(
  deck: DeckRecord,
  setScope: SetScope,
  profile: DeckProfile | undefined,
  existing: Suggestion[],
  taggerCtx: TaggerContext,
  debug?: { ruleId?: string; collector?: { push: (e: Record<string, unknown>) => void } },
): Suggestion[] {
  const themes = (profile?.themes || []).map((t) => t.trim()).filter(Boolean);
  if (!themes.length) return [];
  const hits = eligibleSetCards(deck, setScope, profile)
    .map((card) => {
      const blob = cardTextBlob(card);
      const stored = cardStoredTags(card).map((t) => t.toLowerCase());
      const tagHits: string[] = [];
      const textHits: string[] = [];
      themes.forEach((theme) => {
        const needle = theme.toLowerCase();
        if (stored.some((t) => t === needle || t.indexOf(needle) >= 0)) {
          tagHits.push(theme);
        } else if (blob.indexOf(needle) >= 0) {
          textHits.push(theme);
        }
      });
      if (!tagHits.length && !textHits.length) return null;
      const primary = tagHits.length ? tagHits : textHits;
      return {
        card,
        confidence: (tagHits.length ? 'medium' : 'low') as 'medium' | 'low',
        rationale: tagHits.length
          ? 'Theme match (' + tagHits.join(', ') + ') via Scryfall tags.'
          : 'Theme match (' + textHits.join(', ') + ') via type line / rules text.',
        rolesMatched: ['theme', ...primary],
        signals: { tags: tagHits, textHints: textHits },
      };
    })
    .filter((h): h is NonNullable<typeof h> => !!h);
  return emitSynergyHits('theme_synergy', hits, deck, profile, existing, taggerCtx, debug);
}
