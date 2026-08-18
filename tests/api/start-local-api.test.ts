import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { samLocalStartApiArgs, samLocalStartApiCommand } from '../../scripts/start-local-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('sam local start-api launcher', () => {
  it('passes an absolute samconfig path so SAM does not resolve it under .aws-sam/build', () => {
    const args = samLocalStartApiArgs(root);
    const configFile = args[args.indexOf('--config-file') + 1];
    const template = args[args.indexOf('--template') + 1];
    expect(path.isAbsolute(configFile)).toBe(true);
    expect(configFile).toBe(path.join(root, 'infra/samconfig.toml'));
    expect(template).toBe(path.join(root, '.aws-sam/build/template.yaml'));
    const command = samLocalStartApiCommand(root);
    expect(command).toContain(`"${configFile}"`);
    expect(command.startsWith('sam ')).toBe(true);
  });

  it('is what start:api runs after merge-local-env', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['start:api']).toMatch(/node scripts\/start-local-api\.mjs/);
    expect(pkg.scripts['start:api']).not.toMatch(/--config-file infra\/samconfig\.toml/);
  });

  it('starts SAM without --warm-containers so each request remounts the rebuilt handler', () => {
    const command = samLocalStartApiCommand(root);
    expect(command).not.toMatch(/--warm-containers/);
  });
});
