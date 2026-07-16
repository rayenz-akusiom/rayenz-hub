import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadHubModule, readHubFile, resetHubModules } from '../helpers/hubHarness.js';

let HubUtils;

beforeEach(() => {
   document.head.innerHTML = '';
   resetHubModules();
   loadHubModule('shared/string-utils.js', 'StringUtils');
   HubUtils = loadHubModule('shared/hub-utils.js', 'HubUtils');
});

afterEach(() => {
   resetHubModules();
});

describe('HubUtils.escapeHtml', () => {
   it('escapes HTML-significant characters', () => {
      expect(HubUtils.escapeHtml('<a href="x">Tom & Jerry</a>'))
         .toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;');
   });

   it('coerces nullish input to an empty string', () => {
      expect(HubUtils.escapeHtml(null)).toBe('');
      expect(HubUtils.escapeHtml(undefined)).toBe('');
   });
});

describe('HubUtils scryfall image builders', () => {
   it('builds an image url from a scryfall id', () => {
      expect(HubUtils.scryfallImageFromId('abc-123'))
         .toBe('https://api.scryfall.com/cards/abc-123?format=image&version=normal');
      expect(HubUtils.scryfallImageFromId('')).toBe('');
   });

   it('builds an image url from a set + collector number', () => {
      expect(HubUtils.scryfallImageFromPrinting('CMM', '1'))
         .toBe('https://api.scryfall.com/cards/cmm/1?format=image&version=normal');
      expect(HubUtils.scryfallImageFromPrinting('cmm', '')).toBe('');
      expect(HubUtils.scryfallImageFromPrinting('', '1')).toBe('');
   });

   it('builds an image url from an exact name', () => {
      expect(HubUtils.scryfallImageFromName('Sol Ring'))
         .toBe('https://api.scryfall.com/cards/named?exact=Sol%20Ring&format=image&version=normal');
      expect(HubUtils.scryfallImageFromName('')).toBe('');
   });
});

describe('HubUtils.optionKey', () => {
   it('joins name/set/collector into a stable key', () => {
      expect(HubUtils.optionKey({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1' }))
         .toBe('Sol Ring|cmm|1');
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
      delete window.RayenzArchidektBridge;
   });

   it('reports unavailable when no bridge is present', () => {
      delete window.RayenzArchidektBridge;
      expect(HubUtils.bridgeAvailable()).toBeFalsy();
      expect(HubUtils.bridgeApplyAvailable()).toBe(false);
   });

   it('reports apply-available only when stageApply exists', () => {
      window.RayenzArchidektBridge = { isAvailable: true };
      expect(HubUtils.bridgeAvailable()).toBe(true);
      expect(HubUtils.bridgeApplyAvailable()).toBe(false);

      window.RayenzArchidektBridge = { isAvailable: true, stageApply: () => {} };
      expect(HubUtils.bridgeApplyAvailable()).toBe(true);
   });
});

describe('HubUtils.ensureCss', () => {
   it('injects a stylesheet link once', () => {
      HubUtils.ensureCss('apps/foo/foo.css', 'data-foo-css');
      HubUtils.ensureCss('apps/foo/foo.css', 'data-foo-css');
      const links = document.querySelectorAll('link[data-foo-css]');
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute('href')).toBe('apps/foo/foo.css');
   });
});

describe('HubUtils.mountAppProgress', () => {
   it('returns null when host is missing', () => {
      loadHubModule('shared/hub-progress.js', 'HubProgress');
      expect(HubUtils.mountAppProgress(null, 'test-app')).toBeNull();
   });

   it('mounts HubProgress when host and module exist', () => {
      loadHubModule('shared/hub-progress.js', 'HubProgress');
      document.body.innerHTML = '<div id="host"></div>';
      const controller = HubUtils.mountAppProgress(document.getElementById('host'), 'test-app');
      expect(controller).toBeTruthy();
      expect(document.querySelector('.hub-progress-bar')).toBeTruthy();
   });
});

describe('hub apps no longer redefine shared helpers', () => {
   it('order-reconcile.js delegates to HubUtils', () => {
      const src = readHubFile('apps/order-reconcile/order-reconcile.js');
      expect(src).not.toMatch(/function escapeHtml\b/);
      expect(src).not.toMatch(/function scryfallImageFromId\b/);
      expect(src).toMatch(/HubUtils\.escapeHtml/);
   });

   it('deck-review.js delegates to HubUtils', () => {
      const src = readHubFile('apps/deck-review/deck-review.js');
      expect(src).not.toMatch(/function escapeHtml\b/);
      expect(src).not.toMatch(/function scryfallImageFromId\b/);
      expect(src).toMatch(/HubUtils\.escapeHtml/);
   });
});
