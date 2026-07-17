import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('hubDocumentRootFromEntry BASE_URL branches', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function rootWithoutEntry(baseUrl: string) {
    vi.stubEnv('BASE_URL', baseUrl);
    vi.resetModules();
    const mod = await import('../../../packages/web/src/hub/core-scripts.ts');
    return mod.hubDocumentRootFromEntry(undefined);
  }

  it('resolves absolute BASE_URL with trailing slash', async () => {
    const root = await rootWithoutEntry('/rayenz-hub/');
    expect(root).toBe(`${window.location.origin}/rayenz-hub/`);
  });

  it('normalizes absolute BASE_URL missing trailing slash', async () => {
    const root = await rootWithoutEntry('/rayenz-hub');
    expect(root).toBe(`${window.location.origin}/rayenz-hub/`);
  });

  it('falls back to origin root for relative BASE_URL', async () => {
    const root = await rootWithoutEntry('./');
    expect(root).toBe(`${window.location.origin}/`);
  });
});
