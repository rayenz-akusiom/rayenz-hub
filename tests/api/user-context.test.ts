import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveUserId } from '../../packages/shared/src/user-context.ts';

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
  it('maps validated API key to HUB_USER_ID', () => {
    expect(resolveUserId({ type: 'api-key', validated: true }, { HUB_USER_ID: 'solo' })).toBe('solo');
  });

  it('uses bootstrap default only via user-context when HUB_USER_ID unset', () => {
    expect(resolveUserId({ type: 'api-key', validated: true }, {})).toBe('default');
  });

  it('uses JWT sub when Cognito auth is enabled', () => {
    expect(resolveUserId({ type: 'jwt', validated: true, sub: 'abc-123' }, {})).toBe('abc-123');
  });

  it('rejects unauthenticated contexts', () => {
    expect(() => resolveUserId({ type: 'none', validated: false }, {})).toThrow('Unauthorized');
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
