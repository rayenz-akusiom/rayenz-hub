import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubUtils } from '../../../packages/web/src/lib/hub-utils.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';

beforeEach(() => {
  document.head.innerHTML = '';
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('HubUtils scryfall image builders', () => {
  it('builds a CDN image url from a scryfall id', () => {
    expect(HubUtils.scryfallImageFromId('abc-123')).toBe(
      'https://cards.scryfall.io/normal/front/a/b/abc-123.jpg',
    );
    expect(HubUtils.scryfallImageFromId('')).toBe('');
    expect(HubUtils.scryfallImageFromId('a')).toBe('');
  });

  it('builds an image url from a set + collector number', () => {
    expect(HubUtils.scryfallImageFromPrinting('CMM', '1')).toBe(
      'https://api.scryfall.com/cards/cmm/1?format=image&version=normal',
    );
    expect(HubUtils.scryfallImageFromPrinting('cmm', '')).toBe('');
    expect(HubUtils.scryfallImageFromPrinting('', '1')).toBe('');
  });

  it('builds an image url from an exact name', () => {
    expect(HubUtils.scryfallImageFromName('Sol Ring')).toBe(
      'https://api.scryfall.com/cards/named?exact=Sol%20Ring&format=image&version=normal',
    );
    expect(HubUtils.scryfallImageFromName('')).toBe('');
  });
});

describe('HubUtils.optionKey', () => {
  it('joins name/set/collector into a stable key', () => {
    expect(HubUtils.optionKey({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1' })).toBe(
      'Sol Ring|cmm|1',
    );
    expect(HubUtils.optionKey({ name: 'Sol Ring' })).toBe('Sol Ring||');
  });
});

describe('HubUtils.sleep', () => {
  it('resolves after the timeout', async () => {
    await expect(HubUtils.sleep(0)).resolves.toBeUndefined();
  });
});

describe('HubUtils.ensureCss', () => {
  it('injects a stylesheet link once', () => {
    HubUtils.ensureCss('apps/foo/foo.css', 'data-foo-css');
    HubUtils.ensureCss('apps/foo/foo.css', 'data-foo-css');
    const links = document.querySelectorAll('link[data-foo-css]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toMatch(/apps\/foo\/foo\.css$/);
  });
});

describe('HubUtils.isLocalHub', () => {
  it('returns false when location access throws', () => {
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      get() {
        throw new Error('no location');
      },
    });
    expect(HubUtils.isLocalHub()).toBe(false);
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('returns true for 127.0.0.1', () => {
    const original = window.location.hostname;
    Object.defineProperty(window.location, 'hostname', { value: '127.0.0.1', configurable: true });
    expect(HubUtils.isLocalHub()).toBe(true);
    Object.defineProperty(window.location, 'hostname', { value: original, configurable: true });
  });
});

describe('HubUtils.mountAppProgress', () => {
  it('returns null when host is missing', () => {
    expect(HubUtils.mountAppProgress(null)).toBeNull();
  });

  it('mounts HubProgress when host exists', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const controller = HubUtils.mountAppProgress(document.getElementById('host'));
    expect(controller).toBeTruthy();
    expect(document.querySelector('.hub-progress-bar')).toBeTruthy();
  });
});

describe('HubUtils.resolveHubUrl', () => {
  it('resolves paths against hub document root', () => {
    expect(HubUtils.resolveHubUrl('apps/foo/foo.css')).toMatch(/apps\/foo\/foo\.css$/);
  });

  it('returns the input path when URL construction fails', () => {
    expect(HubUtils.resolveHubUrl('http://[')).toBe('http://[');
  });
});

describe('HubUtils.suggestionsExportFilename', () => {
  it('builds filename from meta set_code and generated_at', () => {
    expect(
      HubUtils.suggestionsExportFilename({
        meta: { set_code: 'msh', generated_at: '2026-06-30' },
      }),
    ).toBe('MSH-2026-06-30-rules.json');
  });

  it('uses defaults when meta is missing', () => {
    const name = HubUtils.suggestionsExportFilename({});
    expect(name).toMatch(/^SET-\d{4}-\d{2}-\d{2}-rules\.json$/);
  });
});

describe('HubUtils.downloadSuggestionsJson', () => {
  it('creates a blob download and returns filename', () => {
    const click = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const anchor = document.createElement('a');
    anchor.click = click;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    const filename = HubUtils.downloadSuggestionsJson({
      meta: { set_code: 'MSH', generated_at: '2026-06-30' },
      decks: [],
    });
    expect(filename).toBe('MSH-2026-06-30-rules.json');
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe('HubUtils.handoffSnapshotSummary', () => {
  it('reports allReady when every reviewable deck has a snapshot', () => {
    const summary = HubUtils.handoffSnapshotSummary({
      decks: [
        { suggestions: [{ id: 's1' }], deck_snapshot: { cards: [{ name: 'A' }] } },
        { suggestions: [{ id: 's2' }], deck_snapshot: { cards: [{ name: 'B' }] } },
      ],
    });
    expect(summary.allReady).toBe(true);
    expect(summary.missingSnapshots).toBe(0);
  });

  it('handles empty or null data', () => {
    expect(HubUtils.handoffSnapshotSummary(null as never)).toEqual({
      reviewable: 0,
      withSnapshots: 0,
      missingSnapshots: 0,
      allReady: false,
    });
  });
});
