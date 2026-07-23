/**
 * SAM esbuild leaves `sharp` external. Host `npm install` may only have win32
 * binaries; SAM local / Lambda need linux-x64. Install platform packages into
 * the build artifact after `sam build`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = path.join(root, '.aws-sam/build/HubApiFunction');
const srcFonts = path.join(root, 'packages/api/assets/fonts');
const destFonts = path.join(artifact, 'assets/fonts');

if (!existsSync(artifact)) {
  console.error(`Missing build artifact: ${artifact}`);
  process.exit(1);
}

const apiPkg = JSON.parse(readFileSync(path.join(root, 'packages/api/package.json'), 'utf8'));
const sharpVersion = String(apiPkg.dependencies?.sharp || '').replace(/^[^0-9]*/, '') || '0.35.3';

// Do not set "type":"module" — SAM esbuild emits CommonJS handler.js.
const pkgPath = path.join(artifact, 'package.json');
writeFileSync(
  pkgPath,
  JSON.stringify(
    {
      name: 'hub-api-lambda',
      private: true,
      dependencies: { sharp: sharpVersion },
    },
    null,
    2,
  ),
);

console.log(`Installing sharp@${sharpVersion} (linux-x64) into Lambda artifact…`);
execSync(`npm install --omit=dev --no-package-lock --cpu=x64 --os=linux --libc=glibc sharp@${sharpVersion}`, {
  cwd: artifact,
  stdio: 'inherit',
  env: {
    ...process.env,
    npm_config_os: 'linux',
    npm_config_cpu: 'x64',
    npm_config_libc: 'glibc',
  },
});

if (existsSync(srcFonts)) {
  mkdirSync(destFonts, { recursive: true });
  cpSync(srcFonts, destFonts, { recursive: true });
  console.log(`Copied fonts → ${destFonts}`);
}
