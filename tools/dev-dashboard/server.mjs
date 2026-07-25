#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import {
  DASHBOARD_DIR,
  listStatuses,
  startService,
  stopService,
  restartService,
  startStack,
  stopStack,
  readLogTail,
  getService,
} from './lib.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.DEV_DASHBOARD_PORT || 5050);
const PUBLIC_DIR = join(DASHBOARD_DIR, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  rel = rel.replace(/\?.*$/, '');
  if (rel.includes('..')) {
    sendText(res, 400, 'Bad path');
    return;
  }
  const filePath = join(PUBLIC_DIR, rel);
  if (!existsSync(filePath)) {
    sendText(res, 404, 'Not found');
    return;
  }
  const ext = extname(filePath);
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(readFileSync(filePath));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/services') {
    sendJson(res, 200, { services: await listStatuses() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/stack/start') {
    sendJson(res, 200, { results: await startStack() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/stack/stop') {
    sendJson(res, 200, { results: await stopStack() });
    return;
  }

  const svcMatch = pathname.match(/^\/api\/services\/([a-z0-9-]+)(?:\/(start|stop|restart|logs))?$/);
  if (svcMatch) {
    const id = svcMatch[1];
    const action = svcMatch[2];
    try {
      getService(id);
    } catch {
      sendJson(res, 404, { error: `Unknown service: ${id}` });
      return;
    }

    if (req.method === 'GET' && action === 'logs') {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const lines = Number(url.searchParams.get('lines') || 80);
      sendJson(res, 200, { id, logs: readLogTail(id, lines) });
      return;
    }

    if (req.method === 'POST' && (action === 'start' || action === 'stop' || action === 'restart')) {
      await readBody(req);
      try {
        const fn = action === 'start' ? startService : action === 'stop' ? stopService : restartService;
        const result = await fn(id);
        sendJson(res, 200, { id, action, ...result });
      } catch (err) {
        sendJson(res, 409, { id, action, error: err.message });
      }
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    sendJson(res, 500, { error: err.message || String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Rayenz Hub local dashboard → http://${HOST}:${PORT}`);
});
