import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCognitoOverlay,
  mergeLocalEnvFiles,
  mergeSamEnvVars,
  missingOverlayKeys,
  overlayMissingMessage,
} from '../../scripts/merge-local-env.mjs';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hub-env-'));
  dirs.push(dir);
  mkdirSync(path.join(dir, 'infra'));
  return dir;
}

describe('merge local SAM env', () => {
  it('overlay keys win over committed env.local.json', () => {
    const merged = mergeSamEnvVars(
      { HubApiFunction: { HUB_USER_ID: 'rayenz-local', HUB_TABLE_NAME: 'HubTable' } },
      { HubApiFunction: { HUB_USER_ID: 'cognito-sub', COGNITO_CLIENT_ID: 'abc' } },
    );
    expect(merged.HubApiFunction).toEqual({
      HUB_USER_ID: 'cognito-sub',
      HUB_TABLE_NAME: 'HubTable',
      COGNITO_CLIENT_ID: 'abc',
    });
  });

  it('reports missing Cognito overlay keys', () => {
    expect(missingOverlayKeys({ COGNITO_USER_POOL_ID: 'pool' })).toEqual([
      'COGNITO_CLIENT_ID',
      'COGNITO_CLIENT_SECRET',
      'HUB_USER_ID',
      'HUB_OWNER_SUB',
    ]);
  });

  it('rejects an incomplete overlay', () => {
    expect(() =>
      assertCognitoOverlay('infra/env.local.overlay.json', { HubApiFunction: { COGNITO_USER_POOL_ID: 'pool' } }),
    ).toThrow(/COGNITO_CLIENT_ID/);
  });

  it('explains how to create a missing overlay', () => {
    expect(overlayMissingMessage('infra/env.local.overlay.json')).toMatch(/setup:local-cognito/);
  });

  it('writes merged env when overlay is complete', () => {
    const root = tempRoot();
    writeFileSync(
      path.join(root, 'infra', 'env.local.json'),
      JSON.stringify({ HubApiFunction: { HUB_TABLE_NAME: 'HubTable', HUB_USER_ID: 'rayenz-local' } }),
    );
    writeFileSync(
      path.join(root, 'infra', 'env.local.overlay.json'),
      JSON.stringify({
        HubApiFunction: {
          COGNITO_USER_POOL_ID: 'us-east-1_pool',
          COGNITO_CLIENT_ID: 'client',
          COGNITO_CLIENT_SECRET: 'secret',
          HUB_USER_ID: 'sub-1',
          HUB_OWNER_SUB: 'sub-1',
        },
      }),
    );
    const mergedPath = mergeLocalEnvFiles(root);
    const merged = JSON.parse(readFileSync(mergedPath, 'utf8'));
    expect(merged.HubApiFunction.HUB_TABLE_NAME).toBe('HubTable');
    expect(merged.HubApiFunction.HUB_USER_ID).toBe('sub-1');
    expect(merged.HubApiFunction.COGNITO_CLIENT_SECRET).toBe('secret');
  });

  it('fails when overlay file is missing', () => {
    const root = tempRoot();
    writeFileSync(
      path.join(root, 'infra', 'env.local.json'),
      JSON.stringify({ HubApiFunction: { HUB_TABLE_NAME: 'HubTable' } }),
    );
    expect(() => mergeLocalEnvFiles(root)).toThrow(/setup:local-cognito/);
  });
});
