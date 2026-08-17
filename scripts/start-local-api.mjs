/**
 * Launch `sam local start-api` with an absolute --config-file.
 * SAM resolves that flag relative to the template directory, so
 * `--config-file infra/samconfig.toml --template .aws-sam/build/template.yaml`
 * looks for `.aws-sam/build/infra/samconfig.toml` and fails.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function samLocalStartApiArgs(rootDir) {
  return [
    'local',
    'start-api',
    '--config-file',
    path.resolve(rootDir, 'infra/samconfig.toml'),
    '--template',
    path.resolve(rootDir, '.aws-sam/build/template.yaml'),
    '--env-vars',
    path.resolve(rootDir, 'infra/env.local.merged.json'),
    '--port',
    '3000',
    '--host',
    '0.0.0.0',
  ];
}

function quoteShellArg(value) {
  if (value.startsWith('--') || /^[A-Za-z0-9_.=:-]+$/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function samLocalStartApiCommand(rootDir) {
  return `sam ${samLocalStartApiArgs(rootDir).map(quoteShellArg).join(' ')}`;
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  // shell: true is required on Windows — Node 20+ refuses to spawn .cmd without it (EINVAL).
  const child = spawn(samLocalStartApiCommand(root), {
    stdio: 'inherit',
    cwd: root,
    shell: true,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 1);
  });
  child.on('error', (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
