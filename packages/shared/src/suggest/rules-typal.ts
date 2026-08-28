import type { DeckProfile, DeckRecord, SetScope, Suggestion, TaggerContext } from './types';
import { eligibleSetCards, emitSynergyHits } from './synergy-emit';

function typeTokens(typeLine: string | undefined): string[] {
  return String(typeLine || '')
    .split(/[\s—\-/,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function runTypalSynergy(
  deck: DeckRecord,
  setScope: SetScope,
  profile: DeckProfile | undefined,
  existing: Suggestion[],
  taggerCtx: TaggerContext,
  debug?: { ruleId?: string; collector?: { push: (e: Record<string, unknown>) => void } },
): Suggestion[] {
  const types = (profile?.typal_types || []).map((t) => t.trim()).filter(Boolean);
  if (!types.length) return [];
  const hits = eligibleSetCards(deck, setScope, profile, taggerCtx.focusTags)
    .map((card) => {
      const tokens = typeTokens(card.type_line);
      const matched = types.filter((t) =>
        tokens.some((tok) => tok.toLowerCase() === t.toLowerCase()),
      );
      if (!matched.length) return null;
      return {
        card,
        confidence: 'medium' as const,
        rationale: 'Typal match (' + matched.join(', ') + ') on type line.',
        rolesMatched: ['typal', ...matched],
        signals: { types: matched },
      };
    })
    .filter((h): h is NonNullable<typeof h> => !!h);
  return emitSynergyHits('typal_synergy', hits, deck, profile, existing, taggerCtx, debug);
}
