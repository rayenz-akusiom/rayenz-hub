import { readFileSync } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HubUtils } from '../../../packages/web/src/lib/hub-utils.ts';
import { REPO_ROOT, resetHubModules } from '../helpers/hubHarness.ts';

beforeEach(() => {
  document.head.innerHTML = '';
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('HubUtils.escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(HubUtils.escapeHtml('<a href="x">Tom & Jerry</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;',
    );
  });

  it('coerces nullish input to an empty string', () => {
    expect(HubUtils.escapeHtml(null)).toBe('');
    expect(HubUtils.escapeHtml(undefined)).toBe('');
  });
});

describe('HubUtils scryfall image builders', () => {
  it('builds an image url from a scryfall id', () => {
    expect(HubUtils.scryfallImageFromId('abc-123')).toBe(
      'https://api.scryfall.com/cards/abc-123?format=image&version=normal',
    );
    expect(HubUtils.scryfallImageFromId('')).toBe('');
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

describe('HubUtils bridge guards', () => {
  afterEach(() => {
    delete (window as Window & { RayenzArchidektBridge?: unknown }).RayenzArchidektBridge;
  });

  it('reports unavailable when no bridge is present', () => {
    delete (window as Window & { RayenzArchidektBridge?: unknown }).RayenzArchidektBridge;
    expect(HubUtils.bridgeAvailable()).toBeFalsy();
    expect(HubUtils.bridgeApplyAvailable()).toBe(false);
  });

  it('reports apply-available only when stageApply exists', () => {
    (window as Window & { RayenzArchidektBridge?: unknown }).RayenzArchidektBridge = { isAvailable: true };
    expect(HubUtils.bridgeAvailable()).toBe(true);
    expect(HubUtils.bridgeApplyAvailable()).toBe(false);

    (window as Window & { RayenzArchidektBridge?: unknown }).RayenzArchidektBridge = {
      isAvailable: true,
      stageApply: () => {},
    };
    expect(HubUtils.bridgeApplyAvailable()).toBe(true);
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

describe('hub apps no longer redefine shared helpers', () => {
  it('OrderReconcileApp delegates to shared lib helpers', () => {
    const src = readFileSync(
      path.join(REPO_ROOT, 'packages/web/src/order-reconcile/OrderReconcileApp.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/function escapeHtml\b/);
    expect(src).not.toMatch(/function scryfallImageFromId\b/);
    expect(src).toMatch(/from '\.\.\/lib\/hub-progress'/);
  });

  it('DeckReviewApp delegates to shared lib helpers', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'packages/web/src/deck-review/DeckReviewApp.tsx'), 'utf8');
    expect(src).not.toMatch(/function escapeHtml\b/);
    expect(src).not.toMatch(/function scryfallImageFromId\b/);
    expect(src).toMatch(/from '\.\.\/lib\/hub-progress'/);
  });
});
