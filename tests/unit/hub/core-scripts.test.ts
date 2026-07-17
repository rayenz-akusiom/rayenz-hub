import { describe, expect, it } from 'vitest';
import {
  hubDocumentRootFromEntry,
  scriptUrlFromEntry,
} from '../../../packages/web/src/hub/core-scripts.ts';

describe('hub core script URLs', () => {
  it('resolves shared scripts from the Vite app root, not a route pathname', () => {
    const entry = 'http://localhost:5173/src/hub/main.tsx';
    expect(hubDocumentRootFromEntry(entry)).toBe('http://localhost:5173/');
    expect(scriptUrlFromEntry('shared/storage.js', entry)).toBe(
      'http://localhost:5173/shared/storage.js',
    );
    expect(scriptUrlFromEntry('shared/string-utils.js', entry)).toBe(
      'http://localhost:5173/shared/string-utils.js',
    );
  });

  it('resolves from production assets entry under a GH Pages prefix', () => {
    const entry = 'https://example.github.io/rayenz-akusiom/assets/index-abc.js';
    expect(hubDocumentRootFromEntry(entry)).toBe('https://example.github.io/rayenz-akusiom/');
    expect(scriptUrlFromEntry('shared/hub-api-client.js', entry)).toBe(
      'https://example.github.io/rayenz-akusiom/shared/hub-api-client.js',
    );
  });

  it('falls back to origin root when no entry script is present', () => {
    expect(hubDocumentRootFromEntry(undefined)).toBe(`${window.location.origin}/`);
  });
});
