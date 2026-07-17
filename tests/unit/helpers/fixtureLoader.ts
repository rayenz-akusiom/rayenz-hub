import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_ROOT = path.resolve(__dirname, '../../fixtures/suggestions');

export function loadSuggestionFixture(name: string): Record<string, unknown> {
  const filePath = path.join(FIXTURES_ROOT, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

export function deckFromFixture(
  fixture: { decks?: Array<{ deck_id?: string }> },
  deckId: string,
): { deck_id?: string; [key: string]: unknown } {
  const deck = (fixture.decks || []).find((d) => d.deck_id === deckId);
  if (!deck) {
    throw new Error(`deck_id not in fixture: ${deckId}`);
  }
  return deck;
}
