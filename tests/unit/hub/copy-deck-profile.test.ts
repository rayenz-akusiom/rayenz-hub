import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readProfileYaml = vi.fn<(deckId: string) => Promise<string | null>>();
const pushProfile = vi.fn<(deckId: string, body: unknown) => Promise<unknown>>();
const getConfig = vi.fn(() => ({ url: 'http://127.0.0.1:3000', enabled: true }));

vi.mock('../../../packages/web/src/mtg/profile-sync.ts', () => ({
  ProfileSync: {
    readProfileYaml: (deckId: string) => readProfileYaml(deckId),
  },
}));

vi.mock('../../../packages/web/src/api/hub-api-client.ts', () => ({
  HubApiClient: {
    getConfig: () => getConfig(),
    pushProfile: (deckId: string, body: unknown) => pushProfile(deckId, body),
  },
}));

import {
  copyDeckProfile,
  rewriteProfileIdentity,
} from '../../../packages/web/src/deck-builder/profile/copy-deck-profile.ts';

const SOURCE_YAML = [
  'deck_id: source-deck',
  "deck_name: Source Deck",
  'format: commander',
  'tags:',
  '  - tokens',
  'protected_cards:',
  '  - Sol Ring',
  'blocked_cards:',
  '  - Dockside Extortionist',
  'themes:',
  '  - aristocrats',
  'roles:',
  '  - id: ramp',
  '    priority: high',
  '    tags: [mana-rock]',
  '',
].join('\n');

describe('rewriteProfileIdentity', () => {
  it('replaces existing deck_id and deck_name', () => {
    const out = rewriteProfileIdentity(SOURCE_YAML, 'new-id', 'Copy of Source');
    expect(out).toContain('deck_id: new-id');
    expect(out).toContain('deck_name: Copy of Source');
    expect(out).not.toContain('deck_id: source-deck');
    expect(out).toContain('  - Sol Ring');
    expect(out).toContain('  - id: ramp');
  });

  it('inserts missing identity fields', () => {
    const out = rewriteProfileIdentity('format: commander\n', 'x', 'Y');
    expect(out.startsWith('deck_name: Y\ndeck_id: x\n') || out.includes('deck_id: x')).toBe(true);
    expect(out).toContain('deck_name: Y');
    expect(out).toContain('format: commander');
  });
});

describe('copyDeckProfile', () => {
  beforeEach(() => {
    readProfileYaml.mockReset();
    pushProfile.mockReset();
    getConfig.mockReset();
    getConfig.mockReturnValue({ url: 'http://127.0.0.1:3000', enabled: true });
    pushProfile.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops when no source profile exists', async () => {
    readProfileYaml.mockResolvedValue(null);
    await copyDeckProfile(
      { deckId: 'src', archidektId: 99 },
      { deckId: 'copy', name: 'Copy of Src' },
    );
    expect(readProfileYaml).toHaveBeenCalled();
    expect(pushProfile).not.toHaveBeenCalled();
  });

  it('finds YAML via Archidekt alias when deckId miss', async () => {
    readProfileYaml.mockImplementation(async (key) => {
      if (key === '99' || key === 'deck-99') return SOURCE_YAML;
      return null;
    });
    await copyDeckProfile(
      { deckId: 'hub-local', archidektId: 99 },
      { deckId: 'copy-1', name: 'Copy of Hub' },
    );
    expect(readProfileYaml.mock.calls.map((c) => c[0])).toEqual([
      'hub-local',
      '99',
    ]);
    expect(pushProfile).toHaveBeenCalledOnce();
    expect(pushProfile.mock.calls[0][0]).toBe('copy-1');
  });

  it('pushes under the new deck id with rewritten identity and preserved body', async () => {
    readProfileYaml.mockResolvedValue(SOURCE_YAML);
    await copyDeckProfile(
      { deckId: 'source-deck', archidektId: null },
      { deckId: 'new-deck', name: 'Copy of Source Deck' },
    );
    expect(pushProfile).toHaveBeenCalledOnce();
    const [deckId, body] = pushProfile.mock.calls[0];
    expect(deckId).toBe('new-deck');
    const payload = body as {
      yaml: string;
      protectedCards: string[];
      blockedCards: string[];
      tags: string[];
      deckName: string;
    };
    expect(payload.deckName).toBe('Copy of Source Deck');
    expect(payload.protectedCards).toEqual(['Sol Ring']);
    expect(payload.blockedCards).toEqual(['Dockside Extortionist']);
    expect(payload.tags).toEqual(['tokens']);
    expect(payload.yaml).toContain('deck_id: new-deck');
    expect(payload.yaml).toContain('deck_name: Copy of Source Deck');
    expect(payload.yaml).toContain('themes:');
    expect(payload.yaml).toContain('  - aristocrats');
    expect(payload.yaml).toContain('  - id: ramp');
    expect(payload.yaml).not.toContain('deck_id: source-deck');
  });

  it('skips push when API profiles are unavailable', async () => {
    getConfig.mockReturnValue({ url: '', enabled: false });
    readProfileYaml.mockResolvedValue(SOURCE_YAML);
    await copyDeckProfile(
      { deckId: 'source-deck', archidektId: null },
      { deckId: 'new-deck', name: 'Copy' },
    );
    expect(pushProfile).not.toHaveBeenCalled();
  });
});
