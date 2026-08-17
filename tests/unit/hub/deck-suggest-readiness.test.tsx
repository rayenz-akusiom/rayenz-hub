import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isApiConfigured } from '../../../packages/web/src/api/hub-api';
import { getGenerateReadiness, rulesDebugEnabled } from '../../../packages/web/src/deck-suggest/readiness.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';

vi.mock('../../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: vi.fn(() => true),
}));

function readyState(overrides: Record<string, unknown> = {}) {
  const base = {
    setScope: null,
    deckSelection: {
      decks: [{ deck_id: 'd1', deck_name: 'Deck One' }],
      selectedIds: ['d1'],
    },
    ui: {
      setCodesInput: 'MSH',
      releaseId: 'group:ltr',
      setInputMode: 'release' as const,
    },
    settings: { setInputMode: 'release' as const },
    generating: false,
  };
  return Object.assign(base, overrides);
}

beforeEach(() => {
  resetHubModules();
  vi.mocked(isApiConfigured).mockReturnValue(true);
});

afterEach(() => {
  resetHubModules();
  document.body.innerHTML = '';
});

describe('getGenerateReadiness', () => {
  it('returns ok when release, decks, and selection are ready', () => {
    const result = getGenerateReadiness(readyState());
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.items.every((i) => i.ok)).toBe(true);
  });

  it('fails when release is missing', () => {
    const result = getGenerateReadiness(
      readyState({ ui: { setCodesInput: '', releaseId: '', setInputMode: 'release' } }),
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('set');
  });

  it('fails when too many manual set codes', () => {
    const result = getGenerateReadiness(
      readyState({
        ui: {
          setCodesInput: 'A,B,C,D,E,F',
          releaseId: '',
          setInputMode: 'codes',
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('set');
    expect(result.items.find((i) => i.id === 'set')?.label).toMatch(/at most 5/i);
  });

  it('accepts 1–5 manual set codes', () => {
    const result = getGenerateReadiness(
      readyState({
        ui: {
          setCodesInput: 'LTR, LTC',
          releaseId: '',
          setInputMode: 'codes',
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('fails when no decks are loaded', () => {
    const result = getGenerateReadiness(
      readyState({
        deckSelection: { decks: [], selectedIds: [] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('decks');
    expect(result.missing).toContain('selection');
  });

  it('fails when decks exist but none selected', () => {
    const result = getGenerateReadiness(
      readyState({
        deckSelection: {
          decks: [{ deck_id: 'd1', deck_name: 'Deck One' }],
          selectedIds: [],
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('selection');
    expect(result.missing).not.toContain('decks');
  });

  it('stays ok while generating when requirements are met', () => {
    const result = getGenerateReadiness(readyState({ generating: true }));
    expect(result.ok).toBe(true);
    expect(result.generating).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('reads release id from settings when ui input is absent', () => {
    const result = getGenerateReadiness(
      readyState({
        ui: { setCodesInput: '', releaseId: '', setInputMode: 'release' },
        settings: { releaseId: 'group:hob', setInputMode: 'release' },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('fails when API is not configured', () => {
    vi.mocked(isApiConfigured).mockReturnValue(false);
    const result = getGenerateReadiness(readyState());
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('api');
  });

  it('fails when selection exceeds the page cap', () => {
    const ids = Array.from({ length: 21 }, (_, i) => `d${i}`);
    const result = getGenerateReadiness(
      readyState({
        deckSelection: {
          decks: ids.map((id) => ({ deck_id: id, deck_name: id })),
          selectedIds: ids,
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('cap');
    expect(result.items.find((i) => i.id === 'cap')?.label).toMatch(/at most 20/i);
  });
});

describe('rulesDebugEnabled', () => {
  it('returns false when default hostname lookup throws', () => {
    const original = window.location;
    vi.stubGlobal('location', undefined);
    expect(rulesDebugEnabled({ rulesDebug: true })).toBe(false);
    vi.stubGlobal('location', original);
  });

  it('returns false when rulesDebug setting is off', () => {
    expect(rulesDebugEnabled({ rulesDebug: false }, () => true)).toBe(false);
  });
});
