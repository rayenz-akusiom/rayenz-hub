/**
 * Launch `sam local start-api` with an absolute --config-file.
 * SAM resolves that flag relative to the template directory, so
 * `--config-file infra/samconfig.toml --template .aws-sam/build/template.yaml`
 * looks for `.aws-sam/build/infra/samconfig.toml` and fails.
 *
 * Also starts esbuild watch (unless HUB_API_NO_WATCH) so handler/shared
 * edits rebuild `.aws-sam/build` without restarting SAM.
 */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isLocalApiWatchEnabled, startLocalApiWatch } from './watch-local-api.mjs';

const execFileAsync = promisify(execFile);

/** SAM injects host AWS creds into the Lambda. An expired `aws login` session 502s every route. */
export async function assertAwsSession() {
  // Use `aws` not `aws.cmd`: Node 20+ throws EINVAL spawning .cmd without shell.
  try {
    await execFileAsync('aws', ['sts', 'get-caller-identity'], {
      timeout: 20_000,
      windowsHide: true,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String(err.stderr) : '';
    console.error(
      '[hub-api] AWS session is missing or expired. SAM local injects host credentials into the Lambda; without them every route returns 502 and the browser reports CORS.',
    );
    console.error('[hub-api] Run `aws login`, then start the API again.');
    if (stderr.trim()) {
      console.error(stderr.trim());
    } else {
      console.error(detail);
    }
    process.exit(1);
  }
}

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
  let watchHandle = null;
  let exiting = false;

  const stopWatchAndExit = async (code) => {
    if (exiting) return;
    exiting = true;
    if (watchHandle) {
      try {
        await watchHandle.stop();
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
      }
    }
    process.exit(code);
  };

  await assertAwsSession();

  if (isLocalApiWatchEnabled()) {
    try {
      watchHandle = await startLocalApiWatch(root);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  } else {
    console.log('[hub-api] watch disabled (HUB_API_NO_WATCH)');
  }

  // shell: true is required on Windows — Node 20+ refuses to spawn .cmd without it (EINVAL).
  const child = spawn(samLocalStartApiCommand(root), {
    stdio: 'inherit',
    cwd: root,
    shell: true,
  });
  child.on('exit', (code, signal) => {
    void stopWatchAndExit(signal ? 1 : (code ?? 1));
  });
  child.on('error', (err) => {
    console.error(err instanceof Error ? err.message : err);
    void stopWatchAndExit(1);
  });
}
