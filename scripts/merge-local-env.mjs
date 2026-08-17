/**
 * Merge committed infra/env.local.json with gitignored Cognito overlay.
 * Overlay wins. Used by `npm run start:api`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HUB_API_FUNCTION = 'HubApiFunction';

export const OVERLAY_REQUIRED_KEYS = [
  'COGNITO_USER_POOL_ID',
  'COGNITO_CLIENT_ID',
  'COGNITO_CLIENT_SECRET',
  'HUB_USER_ID',
  'HUB_OWNER_SUB',
];

/**
 * @param {Record<string, Record<string, string>>} base
 * @param {Record<string, Record<string, string>>} overlay
 * @returns {Record<string, Record<string, string>>}
 */
export function mergeSamEnvVars(base, overlay) {
  /** @type {Record<string, Record<string, string>>} */
  const merged = {};
  const names = new Set([...Object.keys(base || {}), ...Object.keys(overlay || {})]);
  for (const name of names) {
    merged[name] = { ...(base?.[name] || {}), ...(overlay?.[name] || {}) };
  }
  return merged;
}

/**
 * @param {Record<string, string> | undefined} vars
 * @returns {string[]}
 */
export function missingOverlayKeys(vars) {
  return OVERLAY_REQUIRED_KEYS.filter((key) => !String(vars?.[key] || '').trim());
}

export function overlayMissingMessage(overlayPath) {
  return [
    `ERROR: missing ${overlayPath}`,
    'Local sign-in needs the live Cognito pool (client secret must not go in git).',
    'Run: npm run setup:local-cognito',
  ].join('\n');
}

/**
 * @param {string} overlayPath
 * @param {Record<string, Record<string, string>>} overlay
 */
export function assertCognitoOverlay(overlayPath, overlay) {
  const missing = missingOverlayKeys(overlay?.[HUB_API_FUNCTION]);
  if (missing.length) {
    throw new Error(
      `ERROR: ${overlayPath} is missing ${missing.join(', ')}.\nRun: npm run setup:local-cognito`,
    );
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function mergeLocalEnvFiles(rootDir) {
  const basePath = path.join(rootDir, 'infra', 'env.local.json');
  const overlayPath = path.join(rootDir, 'infra', 'env.local.overlay.json');
  const mergedPath = path.join(rootDir, 'infra', 'env.local.merged.json');
  if (!existsSync(basePath)) {
    throw new Error(`ERROR: missing ${basePath}`);
  }
  if (!existsSync(overlayPath)) {
    throw new Error(overlayMissingMessage(overlayPath));
  }
  const base = readJson(basePath);
  const overlay = readJson(overlayPath);
  assertCognitoOverlay(overlayPath, overlay);
  const merged = mergeSamEnvVars(base, overlay);
  writeFileSync(mergedPath, `${JSON.stringify(merged, null, 2)}\n`);
  return mergedPath;
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const mergedPath = mergeLocalEnvFiles(root);
    console.log(`Wrote ${mergedPath}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
