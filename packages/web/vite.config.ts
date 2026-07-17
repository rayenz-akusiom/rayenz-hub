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

export default defineConfig({
  plugins: [react(), hubStaticPlugin()],
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
