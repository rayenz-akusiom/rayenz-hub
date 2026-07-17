import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runGenerationForDeck } from '../../../packages/web/src/deck-suggest/generation.ts';
import { resetHubModules, REPO_ROOT } from '../helpers/hubHarness.ts';

const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/fixtures/deck-suggest');

function loadFixture(name: string) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('runGenerationForDeck', () => {
  it('skips ineligible decks without running rules', async () => {
    const deck = loadFixture('baird-snapshot.json');
    deck.deck_name = 'Vintage Cube';
    const setScope = loadFixture('set-msh-slice.json');
    const result = await runGenerationForDeck(deck, setScope, false);
    expect(result.skipped).toBe(true);
    expect(result.skip_reason).toBe('cube_or_non_commander');
    expect(result.suggestions).toEqual([]);
  });

  it('generates suggestions for eligible fixture deck', async () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = loadFixture('set-msh-slice.json');
    const result = await runGenerationForDeck(deck, setScope, false);
    expect(result.skipped).toBe(false);
    expect(result.suggestions!.length).toBeGreaterThan(0);
    expect(result.analysis).toBeTruthy();
  });
});
