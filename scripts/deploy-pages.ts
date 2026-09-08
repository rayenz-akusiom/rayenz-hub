#!/usr/bin/env node
/**
 * Safely deploy the GitHub Pages SPA by rebuilding the publish tree,
 * committing only the generated Pages artifacts when they changed, and then
 * subtree-pushing the committed `rayenz-hub/` prefix.
 *
 * Usage:
 *   npm run deploy:pages
 *   npx tsx scripts/deploy-pages.ts --dry-run
 */
import { spawnSync } from 'node:child_process';

const PUBLISH_PATHS = [
  'rayenz-hub/index.html',
  'rayenz-hub/404.html',
  'rayenz-hub/.nojekyll',
  'rayenz-hub/assets',
] as const;
const PUBLISH_COMMIT_MESSAGE = 'Publish Hub SPA bundle';

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.npm_config_devdir;
  return env;
}

function run(command: string, options?: { capture?: boolean }): string {
  const result = spawnSync(command, {
    encoding: 'utf8',
    shell: true,
    stdio: options?.capture ? 'pipe' : 'inherit',
    env: childEnv(),
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return (result.stdout || '').trim();
}

function git(args: string, options?: { capture?: boolean }): string {
  return run(`git ${args}`, options);
}

function quotePath(path: string): string {
  return `"${path}"`;
}

function hasStagedChanges(): boolean {
  const result = spawnSync('git diff --cached --quiet --', { shell: true });
  return result.status !== 0;
}

function publishTreeHasCommittedDiff(): boolean {
  const paths = PUBLISH_PATHS.map(quotePath).join(' ');
  const names = git(`diff --cached --name-only -- ${paths}`, { capture: true });
  return names.length > 0;
}

function ensureSafeIndex(): void {
  if (hasStagedChanges()) {
    console.error(
      'Refusing Pages deploy: the git index already has staged changes. Commit or unstage them before running deploy:pages.',
    );
    process.exit(1);
  }
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const paths = PUBLISH_PATHS.map(quotePath).join(' ');

  ensureSafeIndex();

  console.log('Building Pages publish tree...');
  run('npm run publish:hub');

  if (dryRun) {
    const changed = git(`status --short -- ${paths}`, { capture: true });
    if (changed) {
      console.log('\nDry run: publish tree differs from HEAD and would be committed before subtree push.');
      console.log(changed);
    } else {
      console.log('\nDry run: publish tree already matches HEAD; no Pages publish commit would be created.');
    }
    console.log('Dry run: subtree push skipped.');
    return;
  }

  console.log('Staging Pages publish tree...');
  git(`add -- ${paths}`);

  if (publishTreeHasCommittedDiff()) {
    console.log(`Creating Pages publish commit: ${PUBLISH_COMMIT_MESSAGE}`);
    git(`commit -m "${PUBLISH_COMMIT_MESSAGE}"`);
  } else {
    console.log('Pages publish tree already committed; no new publish commit needed.');
  }

  console.log('Pushing Pages subtree...');
  run('npm run deploy:hub');
}

main();
