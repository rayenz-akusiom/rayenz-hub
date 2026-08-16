import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../helpers/hubHarness.ts';

describe('deck-suggest bundle guard', () => {
  it('does not import @rayenz-hub/shared/suggest from packages/web/src', () => {
    const root = path.join(REPO_ROOT, 'packages/web/src');
    const hits: string[] = [];
    function walk(dir: string) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(ent.name)) {
          const text = fs.readFileSync(p, 'utf8');
          if (text.includes('@rayenz-hub/shared/suggest')) hits.push(path.relative(root, p));
        }
      }
    }
    walk(root);
    expect(hits).toEqual([]);
  });
});
