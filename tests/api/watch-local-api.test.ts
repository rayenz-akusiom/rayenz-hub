import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TEMPLATE_RESTART_MESSAGE,
  apiLambdaAssetDirs,
  copyApiLambdaStaticAssets,
  hubApiRebuiltMessage,
  isLocalApiWatchEnabled,
  localApiEsbuildOptions,
  localApiEsbuildTargets,
  startLocalApiWatch,
} from '../../scripts/watch-local-api.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hub-api-watch-'));
  dirs.push(dir);
  return dir;
}

function silentLog() {
  return { log() {}, warn() {}, error() {} };
}

describe('local API watch enable', () => {
  it('is on by default and off for HUB_API_NO_WATCH truthy values', () => {
    expect(isLocalApiWatchEnabled({})).toBe(true);
    expect(isLocalApiWatchEnabled({ HUB_API_NO_WATCH: '' })).toBe(true);
    expect(isLocalApiWatchEnabled({ HUB_API_NO_WATCH: '0' })).toBe(true);
    expect(isLocalApiWatchEnabled({ HUB_API_NO_WATCH: '1' })).toBe(false);
    expect(isLocalApiWatchEnabled({ HUB_API_NO_WATCH: 'true' })).toBe(false);
    expect(isLocalApiWatchEnabled({ HUB_API_NO_WATCH: 'YES' })).toBe(false);
    expect(isLocalApiWatchEnabled({ HUB_API_NO_WATCH: 'on' })).toBe(false);
  });
});

describe('local API esbuild targets', () => {
  it('writes SAM artifact filenames with Lambda esbuild options', () => {
    const targets = localApiEsbuildTargets(repoRoot);
    expect(targets.map((t) => t.name)).toEqual(['HubApiFunction', 'SpendLockFunction']);
    expect(targets[0].entry).toBe(path.join(repoRoot, 'packages/api/src/handler.ts'));
    expect(targets[0].outfile).toBe(path.join(repoRoot, '.aws-sam/build/HubApiFunction/handler.js'));
    expect(targets[1].entry).toBe(
      path.join(repoRoot, 'packages/api/src/handlers/spend-lock-events.ts'),
    );
    expect(targets[1].outfile).toBe(
      path.join(repoRoot, '.aws-sam/build/SpendLockFunction/spend-lock-events.js'),
    );

    const opts = localApiEsbuildOptions(targets[0]);
    expect(opts.platform).toBe('node');
    expect(opts.format).toBe('cjs');
    expect(opts.target).toBe('es2022');
    expect(opts.sourcemap).toBe(true);
    expect(opts.minify).toBe(false);
    expect(opts.bundle).toBe(true);
    expect(opts.external).toEqual(['sharp']);
    expect(opts.absWorkingDir).toBe(path.join(repoRoot, 'packages/api'));
  });

  it('bundles HubApiFunction to CJS with sharp left external', async () => {
    const esbuild = await import('esbuild');
    const root = tempRoot();
    const outfile = path.join(root, 'handler.js');
    const base = localApiEsbuildTargets(repoRoot)[0];
    const result = await esbuild.build({
      ...localApiEsbuildOptions({ ...base, outfile }),
      write: true,
    });
    expect(result.errors).toEqual([]);
    const js = readFileSync(outfile, 'utf8');
    expect(js).toMatch(/handler:\s*\(\)\s*=>\s*handler/);
    expect(js).toMatch(/module\.exports\s*=/);
    expect(js).toMatch(/import\(["']sharp["']\)/);
  });

  it('prints a restart warning for template changes and a rebuilt line per function', () => {
    expect(TEMPLATE_RESTART_MESSAGE).toContain('infra/template.yaml changed');
    expect(TEMPLATE_RESTART_MESSAGE).toContain('restart start:api');
    expect(hubApiRebuiltMessage('HubApiFunction')).toBe(
      '[hub-api] rebuilt HubApiFunction — next request uses new code',
    );
  });
});

describe('copy glance assets into the Lambda artifact', () => {
  it('copies fonts and mana without installing sharp', () => {
    const root = tempRoot();
    const dirsMap = apiLambdaAssetDirs(root);
    mkdirSync(dirsMap.fonts.src, { recursive: true });
    mkdirSync(dirsMap.mana.src, { recursive: true });
    writeFileSync(path.join(dirsMap.fonts.src, 'fonts.conf'), 'ok');
    writeFileSync(path.join(dirsMap.mana.src, 'W.svg'), '<svg />');

    copyApiLambdaStaticAssets(root, silentLog());

    expect(readFileSync(path.join(dirsMap.fonts.dest, 'fonts.conf'), 'utf8')).toBe('ok');
    expect(readFileSync(path.join(dirsMap.mana.dest, 'W.svg'), 'utf8')).toBe('<svg />');
  });
});

describe('startLocalApiWatch', () => {
  it('opens one esbuild context per SAM function and disposes on stop', async () => {
    const root = tempRoot();
    mkdirSync(path.join(root, '.aws-sam/build/HubApiFunction'), { recursive: true });
    mkdirSync(path.join(root, '.aws-sam/build/SpendLockFunction'), { recursive: true });
    mkdirSync(path.join(root, 'infra'), { recursive: true });

    const contexts: { watch: number; dispose: number; opts: Record<string, unknown> }[] = [];
    const fakeEsbuild = {
      async context(opts: Record<string, unknown>) {
        const rec = { watch: 0, dispose: 0, opts };
        contexts.push(rec);
        return {
          async watch() {
            rec.watch += 1;
          },
          async dispose() {
            rec.dispose += 1;
          },
        };
      },
    };

    const handle = await startLocalApiWatch(root, { esbuild: fakeEsbuild, log: silentLog() });
    expect(contexts).toHaveLength(2);
    expect(contexts.every((c) => c.watch === 1)).toBe(true);
    expect(contexts[0].opts.outfile).toBe(
      path.join(root, '.aws-sam/build/HubApiFunction/handler.js'),
    );
    expect(contexts[1].opts.outfile).toBe(
      path.join(root, '.aws-sam/build/SpendLockFunction/spend-lock-events.js'),
    );
    await handle.stop();
    expect(contexts.every((c) => c.dispose === 1)).toBe(true);
  });

  it('fails clearly when sam build artifacts are missing', async () => {
    const root = tempRoot();
    await expect(startLocalApiWatch(root, { esbuild: { async context() {} }, log: silentLog() })).rejects.toThrow(
      /Missing SAM artifact directory/,
    );
  });
});

describe('root package.json', () => {
  it('lists esbuild so the watcher does not depend on Vite nested copies', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.devDependencies.esbuild).toBeTruthy();
  });
});
