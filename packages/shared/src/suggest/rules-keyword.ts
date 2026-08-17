import type { DeckProfile, DeckRecord, SetScope, Suggestion, TaggerContext } from './types';
import { hasScryfallOracleTags, oracleTextForFallback, textMatchesNeedle } from './signals';
import { eligibleSetCards, emitSynergyHits } from './synergy-emit';

export function runKeywordSynergy(
  deck: DeckRecord,
  setScope: SetScope,
  profile: DeckProfile | undefined,
  existing: Suggestion[],
  taggerCtx: TaggerContext,
  debug?: { ruleId?: string; collector?: { push: (e: Record<string, unknown>) => void } },
): Suggestion[] {
  const interests = (profile?.keyword_interests || []).map((t) => t.trim()).filter(Boolean);
  if (!interests.length) return [];
  const hits = eligibleSetCards(deck, setScope, profile)
    .map((card) => {
      const printed = (card.keywords || []).map((k) => k.toLowerCase());
      const tagged = hasScryfallOracleTags(card);
      const fallbackText = tagged ? '' : oracleTextForFallback(card);
      const keywordHits: string[] = [];
      const textHits: string[] = [];
      interests.forEach((interest) => {
        const needle = interest.toLowerCase();
        if (printed.some((k) => k === needle || k.indexOf(needle) >= 0)) {
          keywordHits.push(interest);
        } else if (!tagged && textMatchesNeedle(fallbackText, needle)) {
          textHits.push(interest);
        }
      });
      if (!keywordHits.length && !textHits.length) return null;
      const primary = keywordHits.length ? keywordHits : textHits;
      return {
        card,
        confidence: (keywordHits.length ? 'medium' : 'low') as 'medium' | 'low',
        rationale: keywordHits.length
          ? 'Keyword match (' + keywordHits.join(', ') + ') on printed keywords.'
          : 'Keyword/mechanic match (' + textHits.join(', ') + ') in rules text.',
        rolesMatched: ['keyword', ...primary],
        signals: { keywords: keywordHits, textHints: textHits },
      };
    })
    .filter((h): h is NonNullable<typeof h> => !!h);
  return emitSynergyHits('keyword_synergy', hits, deck, profile, existing, taggerCtx, debug);
}
