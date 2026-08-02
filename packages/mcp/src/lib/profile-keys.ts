/** Candidate profile ids for a Hub deck (builder vs Suggest naming). */
export function profileLookupKeys(deck: {
  deckId: string;
  archidektId?: number | null;
}): string[] {
  const keys: string[] = [];
  const push = (k: string | null | undefined) => {
    const s = String(k || '').trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  push(deck.deckId);
  if (deck.archidektId != null) {
    push(String(deck.archidektId));
    push(`deck-${deck.archidektId}`);
  }
  return keys;
}
