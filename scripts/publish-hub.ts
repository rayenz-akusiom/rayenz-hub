#!/usr/bin/env node
/**
 * Build the GitHub Pages SPA with VITE_HUB_API_URL baked in.
 *
 * Usage: npm run publish:hub
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { COGNITO_STACK_REGION } from './cognito-stack.ts';
import { API_STACK_NAME, resolvePublishHubApiUrl } from './hub-api-url.ts';

const PAGES_ROOT = path.resolve('rayenz-hub');
const LF_TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json']);

function npmChildEnv(overrides?: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env, ...(overrides || {}) };
  delete env.npm_config_devdir;
  return env;
}

function normalizeLfRecursive(dir: string): void {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      normalizeLfRecursive(fullPath);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!LF_TEXT_EXTENSIONS.has(ext)) continue;
    const text = fs.readFileSync(fullPath, 'utf8');
    const normalized = text.replace(/\r\n/g, '\n');
    if (normalized !== text) fs.writeFileSync(fullPath, normalized, 'utf8');
  }
}

function normalizePublishTreeLf(): void {
  normalizeLfRecursive(path.join(PAGES_ROOT, 'assets'));
  for (const file of ['index.html', '404.html']) {
    const fullPath = path.join(PAGES_ROOT, file);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
    const text = fs.readFileSync(fullPath, 'utf8');
    const normalized = text.replace(/\r\n/g, '\n');
    if (normalized !== text) fs.writeFileSync(fullPath, normalized, 'utf8');
  }
}

function awsJson(args: string): unknown {
  const result = spawnSync(`aws ${args} --region ${COGNITO_STACK_REGION} --output json`, {
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(err || `aws ${args} failed`);
  }
  return JSON.parse(result.stdout || '{}');
}

function loadApiStackOutputs(): Array<{ OutputKey?: string; OutputValue?: string }> | null {
  const stacks = awsJson(`cloudformation describe-stacks --stack-name ${API_STACK_NAME}`) as {
    Stacks?: Array<{ Outputs?: Array<{ OutputKey?: string; OutputValue?: string }> }>;
  };
  return stacks.Stacks?.[0]?.Outputs || [];
}

function main(): void {
  let url: string;
  try {
    url = resolvePublishHubApiUrl(process.env, loadApiStackOutputs);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
    return;
  }

  console.log(`Baking Hub API URL: ${url}`);
  const build = spawnSync('npm run build:web', {
    stdio: 'inherit',
    shell: true,
    env: npmChildEnv({ VITE_HUB_API_URL: url }),
  });
  if (build.status) {
    process.exit(build.status);
  }
  normalizePublishTreeLf();
  const hint = spawnSync('node scripts/publish-hub-hint.mjs', { stdio: 'inherit', shell: true });
  process.exit(hint.status ?? 0);
}

main();
