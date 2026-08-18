import { describe, expect, it } from 'vitest';
import {
  builderHash,
  builderBasePath,
  parseBuilderRoute,
  resolveLegacyDeckBuilderHash,
  pathFromHash,
  hubUserSlug,
  rewriteRetiredUserSlug,
  isForeignUserSlug,
  isLocalLibrarySlug,
  SANDBOX_USER_SLUG,
} from '../../../packages/web/src/hub/routes.ts';
import { usernameToSlug } from '../../../packages/shared/src/usernames.ts';

describe('builder routes', () => {
  it('builderBasePath maps formats', () => {
    expect(builderBasePath('commander')).toBe('/commander-builder');
    expect(builderBasePath('cube')).toBe('/cube-builder');
  });

  it('builderHash builds library and deep links', () => {
    expect(builderHash('commander')).toBe('#/commander-builder');
    expect(builderHash('cube')).toBe('#/cube-builder');
    expect(builderHash('commander', hubUserSlug(), 'my-deck')).toBe(
      `#/commander-builder/${SANDBOX_USER_SLUG}/my-deck`,
    );
    expect(builderHash('cube', hubUserSlug(), 'vintage-cube')).toBe(
      `#/cube-builder/${SANDBOX_USER_SLUG}/vintage-cube`,
    );
    expect(usernameToSlug('Rayenz')).toBe('rayenz');
    expect(isLocalLibrarySlug(SANDBOX_USER_SLUG)).toBe(true);
    expect(isLocalLibrarySlug('rayenz')).toBe(false);
    expect(rewriteRetiredUserSlug('default')).toBe('rayenz');
    expect(rewriteRetiredUserSlug('friend')).toBe('friend');
    expect(isForeignUserSlug('rayenz')).toBe(true);
    expect(isForeignUserSlug(SANDBOX_USER_SLUG)).toBe(false);
    expect(isForeignUserSlug(null)).toBe(false);
  });

  it('parseBuilderRoute parses commander, cube, and legacy prefixes', () => {
    expect(parseBuilderRoute('#/commander-builder')).toBeNull();
    expect(parseBuilderRoute('#/commander-builder/default/my-deck')).toEqual({
      userSlug: 'default',
      deckSlug: 'my-deck',
    });
    expect(parseBuilderRoute('#/cube-builder/default/vintage-cube')).toEqual({
      userSlug: 'default',
      deckSlug: 'vintage-cube',
    });
    expect(parseBuilderRoute('#/deck-builder/default/legacy-deck')).toEqual({
      userSlug: 'default',
      deckSlug: 'legacy-deck',
    });
    expect(parseBuilderRoute('#/deck-builder/default/a/b')).toBeNull();
  });

  it('parseBuilderRoute respects format filter', () => {
    expect(parseBuilderRoute('#/cube-builder/default/foo', 'commander')).toBeNull();
    expect(parseBuilderRoute('#/commander-builder/default/foo', 'commander')).toEqual({
      userSlug: 'default',
      deckSlug: 'foo',
    });
  });

  it('resolveLegacyDeckBuilderHash redirects library to commander', () => {
    expect(resolveLegacyDeckBuilderHash('#/deck-builder', () => null)).toBe('#/commander-builder');
  });

  it('resolveLegacyDeckBuilderHash sends cube deep links to cube builder', () => {
    const hash = '#/deck-builder/default/vintage-cube';
    expect(
      resolveLegacyDeckBuilderHash(hash, (slug) => (slug === 'vintage-cube' ? 'cube' : 'commander')),
    ).toBe('#/cube-builder/default/vintage-cube');
  });

  it('resolveLegacyDeckBuilderHash sends unknown deep links to commander builder', () => {
    const hash = '#/deck-builder/default/unknown-deck';
    expect(resolveLegacyDeckBuilderHash(hash, () => null)).toBe(
      '#/commander-builder/default/unknown-deck',
    );
  });

  it('pathFromHash maps builder paths including nested deep links', () => {
    expect(pathFromHash('#/commander-builder')).toBe('/commander-builder');
    expect(pathFromHash('#/commander-builder/default/foo')).toBe('/commander-builder');
    expect(pathFromHash('#/cube-builder/default/foo')).toBe('/cube-builder');
    expect(pathFromHash('#/deck-builder/default/foo')).toBe('/deck-builder');
  });
});
