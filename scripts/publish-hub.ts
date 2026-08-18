#!/usr/bin/env node
/**
 * Build the GitHub Pages SPA with VITE_HUB_API_URL baked in.
 *
 * Usage: npm run publish:hub
 */
import { spawnSync } from 'node:child_process';
import { COGNITO_STACK_REGION } from './cognito-stack.ts';
import { API_STACK_NAME, resolvePublishHubApiUrl } from './hub-api-url.ts';

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
    env: { ...process.env, VITE_HUB_API_URL: url },
  });
  if (build.status) {
    process.exit(build.status);
  }
  const hint = spawnSync('node scripts/publish-hub-hint.mjs', { stdio: 'inherit', shell: true });
  process.exit(hint.status ?? 0);
}

main();
