/**
 * Live-reload the SAM local Lambda artifacts while `sam local start-api` stays up.
 * esbuild watch writes handler.js into `.aws-sam/build` so the next request
 * (new container; no --warm-containers) picks up packages/api + packages/shared.
 */
import { cpSync, existsSync, mkdirSync, watch } from 'node:fs';
import path from 'node:path';

export const TEMPLATE_RESTART_MESSAGE =
  '[hub-api] infra/template.yaml changed — restart start:api to pick up new routes/env (handler JS still live-reloads)';

export function hubApiRebuiltMessage(name) {
  return `[hub-api] rebuilt ${name} — next request uses new code`;
}

const DISABLE_WATCH_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isLocalApiWatchEnabled(env = process.env) {
  const raw = env.HUB_API_NO_WATCH;
  if (raw == null || raw === '') return true;
  return !DISABLE_WATCH_VALUES.has(String(raw).trim().toLowerCase());
}

export function localApiEsbuildTargets(rootDir) {
  const apiRoot = path.join(rootDir, 'packages/api');
  return [
    {
      name: 'HubApiFunction',
      absWorkingDir: apiRoot,
      entry: path.join(apiRoot, 'src/handler.ts'),
      outfile: path.join(rootDir, '.aws-sam/build/HubApiFunction/handler.js'),
    },
    {
      name: 'SpendLockFunction',
      absWorkingDir: apiRoot,
      entry: path.join(apiRoot, 'src/handlers/spend-lock-events.ts'),
      outfile: path.join(rootDir, '.aws-sam/build/SpendLockFunction/spend-lock-events.js'),
    },
  ];
}

export function localApiEsbuildOptions(target) {
  return {
    absWorkingDir: target.absWorkingDir,
    entryPoints: [target.entry],
    outfile: target.outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2022',
    sourcemap: true,
    minify: false,
    external: ['sharp'],
    logLevel: 'silent',
  };
}

export function apiLambdaAssetDirs(rootDir) {
  return {
    fonts: {
      src: path.join(rootDir, 'packages/api/assets/fonts'),
      dest: path.join(rootDir, '.aws-sam/build/HubApiFunction/assets/fonts'),
    },
    mana: {
      src: path.join(rootDir, 'packages/api/assets/mana'),
      dest: path.join(rootDir, '.aws-sam/build/HubApiFunction/assets/mana'),
    },
  };
}

export function copyApiLambdaStaticAssets(rootDir, log = console) {
  const dirs = apiLambdaAssetDirs(rootDir);
  for (const { src, dest } of Object.values(dirs)) {
    if (!existsSync(src)) continue;
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
  log.log('[hub-api] copied glance assets into Lambda artifact');
}

function formatEsbuildMessages(messages) {
  return messages
    .map((m) => {
      const loc = m.location
        ? `${m.location.file}:${m.location.line}:${m.location.column}`
        : '';
      return loc ? `${loc}: ${m.text}` : m.text;
    })
    .join('\n');
}

function rebuildNotifyPlugin(name, log) {
  return {
    name: `hub-api-rebuild-notify-${name}`,
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length) {
          log.error(`[hub-api] ${name} rebuild failed:\n${formatEsbuildMessages(result.errors)}`);
          return;
        }
        if (result.warnings.length) {
          log.warn(`[hub-api] ${name} rebuild warnings:\n${formatEsbuildMessages(result.warnings)}`);
        }
        log.log(hubApiRebuiltMessage(name));
      });
    },
  };
}

function debounce(fn, ms) {
  let timer = null;
  const run = () => {
    timer = null;
    fn();
  };
  const wrapped = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

function watchTemplateYaml(rootDir, log) {
  const templatePath = path.resolve(rootDir, 'infra/template.yaml');
  const dir = path.dirname(templatePath);
  if (!existsSync(dir)) {
    return { close() {} };
  }
  const warn = debounce(() => log.warn(TEMPLATE_RESTART_MESSAGE), 300);
  const watcher = watch(dir, (event, filename) => {
    if (!filename) {
      warn();
      return;
    }
    if (path.basename(filename) === 'template.yaml') warn();
  });
  watcher.on('error', (err) => {
    log.warn(`[hub-api] template watch error: ${err instanceof Error ? err.message : err}`);
  });
  return {
    close() {
      warn.cancel();
      watcher.close();
    },
  };
}

function watchGlanceAssets(rootDir, log) {
  const assetsDir = path.join(rootDir, 'packages/api/assets');
  if (!existsSync(assetsDir)) {
    return { close() {} };
  }
  const copy = debounce(() => {
    try {
      copyApiLambdaStaticAssets(rootDir, log);
    } catch (err) {
      log.warn(`[hub-api] asset copy failed: ${err instanceof Error ? err.message : err}`);
    }
  }, 300);
  const watcher = watch(assetsDir, { recursive: true }, () => copy());
  watcher.on('error', (err) => {
    log.warn(`[hub-api] asset watch error: ${err instanceof Error ? err.message : err}`);
  });
  return {
    close() {
      copy.cancel();
      watcher.close();
    },
  };
}

export async function startLocalApiWatch(rootDir, { esbuild, log = console } = {}) {
  const bundler = esbuild ?? (await import('esbuild'));
  const contexts = [];
  for (const target of localApiEsbuildTargets(rootDir)) {
    const outfileDir = path.dirname(target.outfile);
    if (!existsSync(outfileDir)) {
      throw new Error(
        `Missing SAM artifact directory ${outfileDir}. Run \`npm run build:api\` before start:api.`,
      );
    }
    const ctx = await bundler.context({
      ...localApiEsbuildOptions(target),
      plugins: [rebuildNotifyPlugin(target.name, log)],
    });
    await ctx.watch();
    contexts.push(ctx);
  }

  const templateWatcher = watchTemplateYaml(rootDir, log);
  const assetWatcher = watchGlanceAssets(rootDir, log);
  log.log('[hub-api] watching packages/api and packages/shared — save to rebuild (no SAM restart)');

  return {
    async stop() {
      templateWatcher.close();
      assetWatcher.close();
      await Promise.all(contexts.map((ctx) => ctx.dispose()));
    },
  };
}
