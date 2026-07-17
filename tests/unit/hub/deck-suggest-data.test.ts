import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachProfileLists,
  clearDataSetPoolCache,
  Data,
  loadSetScopeFromUpload,
  parseYamlProfile,
  resolveDeckEligibility,
  tryRestoreSetPool,
} from '../../../packages/web/src/deck-suggest/index.ts';
import { saveSetPoolCache } from '../../../packages/web/src/lib/hub-storage.ts';
import { resetHubModules, REPO_ROOT } from '../helpers/hubHarness.ts';

const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/fixtures/deck-suggest');

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('parseYamlProfile', () => {
  it('parses roles, lists, and deck metadata from fixture yaml', () => {
    const text = fs.readFileSync(path.join(FIXTURE_DIR, 'god-bane-profile.yaml'), 'utf8');
    const profile = parseYamlProfile(text);
    expect(profile.deck_id).toBe('god-bane');
    expect(profile.format).toBe('commander');
    expect(profile.roles![0].id).toBe('finisher');
    expect(profile.roles![0].priority).toBe('high');
    expect(profile.roles![0].tags).toEqual(['god', 'creature']);
    expect(profile.protected_cards).toContain('Taurean Mauler');
    expect(profile.blocked_cards).toContain('Door of Destinies');
  });

  it('ignores comments and blank lines', () => {
    const profile = parseYamlProfile('# comment\n\nblocked_cards:\n  - Sol Ring\n');
    expect(profile.blocked_cards).toEqual(['Sol Ring']);
  });
});

describe('resolveDeckEligibility', () => {
  it('skips non-commander profile formats', () => {
    const result = resolveDeckEligibility({
      deck_name: 'Modern',
      profile: { format: 'modern' },
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('non_commander_format');
  });

  it('skips maybeboard-only swap queues', () => {
    const result = resolveDeckEligibility({
      deck_name: 'Maybeboard Queue',
      profile: { format: 'commander' },
      deck_snapshot: {
        cards: [{
          name: 'Sideboard In',
          primary_category: 'Maybeboard',
          categories: ['Maybeboard', 'Queued In'],
        }],
      },
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('maybeboard_swap_queue');
  });

  it('infers commander when format is absent', () => {
    const result = resolveDeckEligibility({ deck_name: 'Plain Deck', profile: {} });
    expect(result.eligible).toBe(true);
    expect(result.inferred).toBe(true);
  });
});

describe('indexSetPool edge cases', () => {
  it('returns null for null scope', () => {
    expect(Data.indexSetPool(null)).toBe(null);
  });

  it('skips cards without names when indexing', () => {
    const scope = Data.indexSetPool({
      primaryCode: 'MSH',
      codes: ['MSH'],
      cards: [{ name: '', set_code: 'MSH' }, { name: 'Bolt', set_code: 'MSH' }],
    })!;
    expect(scope.cardsByName!['']).toBeUndefined();
    expect(scope.cardsByName!['bolt']).toHaveLength(1);
  });
});

describe('tryRestoreSetPool and loadSetScopeFromUpload', () => {
  it('returns null for empty codesKey', () => {
    expect(tryRestoreSetPool('')).toBe(null);
  });

  it('restores uploaded scope and caches by codesKey', () => {
    const scope = loadSetScopeFromUpload({
      primaryCode: 'msh',
      cards: [{ name: 'Bolt', set_code: 'MSH', collector_number: '1' }],
    });
    expect(scope.codes).toEqual(['MSH']);
    expect(tryRestoreSetPool(scope.codesKey!)).toBeTruthy();
    clearDataSetPoolCache();
  });

  it('uses primaryCode when codes array is empty', () => {
    const scope = loadSetScopeFromUpload({
      primaryCode: 'MAR',
      cards: [],
    });
    expect(scope.codes).toEqual(['MAR']);
  });

  it('restores from localStorage when memory cache is cleared', () => {
    const payload = {
      primaryCode: 'MSH',
      codes: ['MSH'],
      codesKey: 'MSH',
      cards: [{ name: 'Cached', set_code: 'MSH', collector_number: '1' }],
      complete: true,
    };
    saveSetPoolCache('MSH', payload);
    clearDataSetPoolCache();
    const restored = tryRestoreSetPool('MSH');
    expect(restored!.cards[0].name).toBe('Cached');
  });
});

describe('attachProfileLists', () => {
  it('copies profile block/protect lists onto deck preferences', () => {
    const deck = attachProfileLists({
      deck_id: 'd1',
      profile: { blocked_cards: ['A'], protected_cards: ['B'] },
    });
    expect(deck.profile_preferences).toEqual({
      blocked_cards: ['A'],
      protected_cards: ['B'],
    });
  });
});

describe('parseDeckListFromText extras', () => {
  it('accepts bare deck ids and deduplicates lines', () => {
    const decks = Data.parseDeckListFromText('3533613\n3533613\n');
    expect(decks).toHaveLength(1);
    expect(decks[0].deck_id).toBe('deck-3533613');
  });
});

describe('readProfileForDeck', () => {
  it('returns null when profile read fails', async () => {
    const { ProfileSync } = await import('../../../packages/web/src/mtg/profile-sync.ts');
    const { readProfileForDeck } = await import('../../../packages/web/src/deck-suggest/data.ts');
    const original = ProfileSync.readProfileYaml;
    ProfileSync.readProfileYaml = vi.fn(async () => {
      throw new Error('missing');
    });
    expect(await readProfileForDeck('missing-deck')).toBe(null);
    ProfileSync.readProfileYaml = original;
  });
});
