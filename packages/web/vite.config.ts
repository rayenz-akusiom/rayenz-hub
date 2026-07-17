import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.resolve(rootDir, '../../rayenz-hub');

const HUB_STATIC_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

/** Serve rayenz-hub static assets (shared CSS, data/) during Vite dev/preview. */
function hubStaticPlugin(): Plugin {
  function serveHubStatic(req: any, res: any, next: () => void) {
    const url = (req.url || '').split('?')[0];
    if (
      !url.startsWith('/shared/') &&
      !url.startsWith('/apps/') &&
      !url.startsWith('/data/')
    ) {
      next();
      return;
    }
    const rootResolved = path.resolve(hubRoot);
    const filePath = path.resolve(hubRoot, decodeURIComponent(url.slice(1)));
    const insideRoot =
      filePath === rootResolved || filePath.startsWith(rootResolved + path.sep);
    if (!insideRoot || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      next();
      return;
    }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', HUB_STATIC_TYPES[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  }

  return {
    name: 'hub-static',
    configureServer(server) {
      server.middlewares.use(serveHubStatic);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveHubStatic);
    },
  };
}

/** GitHub Pages: .nojekyll + 404.html that redirects to the project root.
 *  Do not copy index.html as 404 — relative ./assets/ breaks when the browser
 *  URL is still /repo/apps/.../ (GitHub serves 404.html without changing the path).
 */
function pagesFallbackPlugin(): Plugin {
  const legacyAppsMap = {
    dailies: '#/dailies',
    'neopets-more': '#/neopets-more',
    'deck-builder': '#/commander-builder',
    'deck-suggest': '#/deck-suggest',
    'deck-review': '#/deck-review',
    'order-reconcile': '#/order-reconcile',
    settings: '#/settings/dailies',
  };

  return {
    name: 'pages-fallback',
    closeBundle() {
      fs.writeFileSync(path.join(hubRoot, '.nojekyll'), '');
      const mapJson = JSON.stringify(legacyAppsMap);
      const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting…</title>
    <script>
      (function () {
        var map = ${mapJson};
        var path = location.pathname;
        var m = path.match(/\\/apps\\/([^/]+)\\/?$/);
        var segs = path.split('/').filter(Boolean);
        var root = segs.length ? '/' + segs[0] + '/' : '/';
        var hash = location.hash || '';
        if (m) {
          hash = map[m[1]] || '#/dailies';
        }
        location.replace(root + location.search + hash);
      })();
    </script>
  </head>
  <body>
    <p>Redirecting to Hub…</p>
  </body>
</html>
`;
      fs.writeFileSync(path.join(hubRoot, '404.html'), html);
    },
  };
}

export default defineConfig({
  plugins: [react(), hubStaticPlugin(), pagesFallbackPlugin()],
  base: './',
  resolve: {
    alias: {
      '@rayenz-hub/shared': path.resolve(rootDir, '../shared/src/index.ts'),
    },
  },
  build: {
    outDir: hubRoot,
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(rootDir, 'index.html'),
    },
  },
});
