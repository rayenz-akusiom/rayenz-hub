import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveUserId } from '../../packages/shared/src/user-context.ts';
import {
  isReservedUsername,
  isSandboxUsername,
  normalizeUsername,
  usernameToSlug,
} from '../../packages/shared/src/usernames.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_SRC = path.resolve(__dirname, '../../packages/api/src');

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('resolveUserId', () => {
  it('uses JWT sub when Cognito auth is enabled', () => {
    expect(resolveUserId({ type: 'jwt', validated: true, sub: 'abc-123' })).toBe('abc-123');
  });

  it('rejects JWT without a sub', () => {
    expect(() => resolveUserId({ type: 'jwt', validated: true })).toThrow('Unauthorized');
  });

  it('rejects unauthenticated contexts', () => {
    expect(() => resolveUserId({ type: 'none', validated: false })).toThrow('Unauthorized');
  });
});

describe('api package partition literals', () => {
  it('does not hardcode default outside user-context', () => {
    const files = listTsFiles(API_SRC);
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes('user-context')) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      if (text.includes("'default'") || text.includes('"default"')) {
        offenders.push(path.relative(API_SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('username slugs', () => {
  it('kebabs Rayenz to rayenz', () => {
    expect(usernameToSlug('Rayenz')).toBe('rayenz');
  });

  it('normalizes mixed-case usernames to lowercase', () => {
    expect(normalizeUsername(' Rayenz ')).toBe('rayenz');
    expect(normalizeUsername('FRIEND')).toBe('friend');
  });

  it('treats sandbox and default as reserved', () => {
    expect(isReservedUsername('sandbox')).toBe(true);
    expect(isReservedUsername('Sandbox')).toBe(true);
    expect(isReservedUsername('default')).toBe(true);
    expect(isReservedUsername('Rayenz')).toBe(false);
    expect(isSandboxUsername('sandbox')).toBe(true);
    expect(isSandboxUsername('Sandbox')).toBe(true);
    expect(isSandboxUsername('Rayenz')).toBe(false);
  });
});
