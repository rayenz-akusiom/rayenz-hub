import { describe, expect, it } from 'vitest';
import { StringUtils } from '../../../packages/web/src/lib/string-utils.ts';

describe('StringUtils.svgDataUri', () => {
  it('percent-encodes svg markup', () => {
    expect(StringUtils.svgDataUri('<svg viewBox="0 0 1 1"></svg>')).toBe(
      'data:image/svg+xml,' + encodeURIComponent('<svg viewBox="0 0 1 1"></svg>'),
    );
  });
});

describe('StringUtils.toKebabCase', () => {
  it('converts camelCase and PascalCase', () => {
    expect(StringUtils.toKebabCase('fooBar')).toBe('foo-bar');
    expect(StringUtils.toKebabCase('HTTPResponse')).toBe('http-response');
    expect(StringUtils.toKebabCase('simple')).toBe('simple');
  });

  it('returns empty string for falsy or unmatchable input', () => {
    expect(StringUtils.toKebabCase('')).toBe('');
    expect(StringUtils.toKebabCase('---')).toBe('');
  });
});

describe('StringUtils.toUriEncodedKebabCase', () => {
  it('kebab-cases then URI-encodes', () => {
    expect(StringUtils.toUriEncodedKebabCase('Foo Bar')).toBe(encodeURIComponent('foo-bar'));
  });
});

describe('StringUtils.escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(StringUtils.escapeHtml('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;');
    expect(StringUtils.escapeHtml(null)).toBe('');
  });
});
