import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  pathFromHash,
  normalizeHash,
  isSettingsPath,
  isLegacyPath,
  redirectLegacyAppsPath,
  parseDeckBuilderRoute,
  deckBuilderHash,
  hubUserSlug,
  isLocalLibrarySlug,
  SANDBOX_USER_SLUG,
} from '../../../packages/web/src/hub/routes.ts';

describe('hub routes', () => {
  it('normalizes empty hash to dailies', () => {
    expect(normalizeHash('')).toBe('#/dailies');
    expect(normalizeHash('#')).toBe('#/dailies');
    expect(pathFromHash('')).toBe('/dailies');
  });

  it('parses known paths', () => {
    expect(pathFromHash('#/deck-review')).toBe('/deck-suggest');
    expect(pathFromHash('#/deck-suggest')).toBe('/deck-suggest');
    expect(pathFromHash('#/settings/dailies')).toBe('/settings/dailies');
    expect(pathFromHash('#/settings/hub-api')).toBe('/settings/hub-api');
    expect(pathFromHash('#/deck-builder')).toBe('/deck-builder');
  });

  it('maps deck-builder deep links to /deck-builder HubPath', () => {
    expect(pathFromHash('#/deck-builder/default/fixture-commander')).toBe('/deck-builder');
    expect(pathFromHash('#/deck-builder/default/foo-bar')).toBe('/deck-builder');
  });

  it('parses deck-builder user/deck slug routes', () => {
    expect(parseDeckBuilderRoute('#/deck-builder')).toBeNull();
    expect(parseDeckBuilderRoute('#/deck-builder/')).toBeNull();
    expect(parseDeckBuilderRoute('#/deck-builder/default')).toBeNull();
    expect(parseDeckBuilderRoute('#/deck-builder/default/fixture-commander')).toEqual({
      userSlug: 'default',
      deckSlug: 'fixture-commander',
    });
    expect(parseDeckBuilderRoute('#/deck-builder/default/a/b')).toBeNull();
    expect(parseDeckBuilderRoute('#/commander-builder/default/fixture-commander')).toEqual({
      userSlug: 'default',
      deckSlug: 'fixture-commander',
    });
  });

  it('builds deprecated deck-builder hashes via commander builder', () => {
    expect(deckBuilderHash()).toBe('#/commander-builder');
    expect(deckBuilderHash(hubUserSlug(), 'fixture-commander')).toBe(
      `#/commander-builder/${SANDBOX_USER_SLUG}/fixture-commander`,
    );
    expect(hubUserSlug()).toBe(SANDBOX_USER_SLUG);
  });

  it('falls back unknown paths to dailies', () => {
    expect(pathFromHash('#/nope')).toBe('/dailies');
  });

  it('adds a leading slash when hash path omits it', () => {
    expect(normalizeHash('#commander-builder')).toBe('#/commander-builder');
    expect(pathFromHash('#deck-suggest')).toBe('/deck-suggest');
  });

  it('maps unknown settings subpaths to settings dailies', () => {
    expect(pathFromHash('#/settings')).toBe('/settings');
    expect(pathFromHash('#/settings/unknown-tab')).toBe('/settings/dailies');
  });

  it('detects settings paths', () => {
    expect(isSettingsPath('/settings')).toBe(true);
    expect(isSettingsPath('/settings/dailies')).toBe(true);
    expect(isSettingsPath('/settings/hub-api')).toBe(true);
    expect(isSettingsPath('/dailies')).toBe(false);
    expect(isLegacyPath('/deck-review')).toBe(false);
    expect(isLegacyPath('/dailies')).toBe(false);
    expect(isLegacyPath('/unknown')).toBe(false);
  });

  it('redirects legacy /apps/ pathnames to hash routes', () => {
    const calls: string[] = [];
    const loc = {
      pathname: '/rayenz-akusiom/apps/dailies/',
      search: '',
      replace(url: string) {
        calls.push(url);
      },
    };
    expect(redirectLegacyAppsPath(loc)).toBe(true);
    expect(calls).toEqual(['/rayenz-akusiom/#/dailies']);
  });

  it('preserves search when redirecting legacy /apps/ paths', () => {
    const calls: string[] = [];
    const loc = {
      pathname: '/rayenz-akusiom/apps/deck-review',
      search: '?x=1',
      replace(url: string) {
        calls.push(url);
      },
    };
    expect(redirectLegacyAppsPath(loc)).toBe(true);
    expect(calls).toEqual(['/rayenz-akusiom/?x=1#/deck-suggest']);
  });

  it('does not redirect unknown /apps/ segments or non-apps paths', () => {
    const calls: string[] = [];
    const replace = (url: string) => {
      calls.push(url);
    };
    expect(
      redirectLegacyAppsPath({
        pathname: '/rayenz-akusiom/apps/unknown/',
        search: '',
        replace,
      }),
    ).toBe(false);
    expect(
      redirectLegacyAppsPath({
        pathname: '/rayenz-akusiom/',
        search: '',
        replace,
      }),
    ).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('hub hash navigation (DOM)', () => {
  beforeEach(() => {
    window.location.hash = '';
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    window.location.hash = '';
    sessionStorage.clear();
  });

  it('pathFromHash reads window location hash', () => {
    window.location.hash = '#/order-reconcile';
    expect(pathFromHash()).toBe('/order-reconcile');
  });

  it('hubUserSlug uses the signed-in username', () => {
    sessionStorage.setItem('rayenz-hub-access-token', 'token');
    sessionStorage.setItem('rayenz-hub-username', 'Rayenz');
    expect(hubUserSlug()).toBe('rayenz');
    expect(isLocalLibrarySlug('rayenz')).toBe(true);
    expect(isLocalLibrarySlug(SANDBOX_USER_SLUG)).toBe(true);
  });
});
