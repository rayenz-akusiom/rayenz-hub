import { spawn, execFile } from 'node:child_process';
import { createConnection } from 'node:net';
import { networkInterfaces } from 'node:os';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DASHBOARD_DIR = __dirname;
export const REPO_ROOT = join(__dirname, '..', '..');
export const LOGS_DIR = join(__dirname, 'logs');
export const STATE_PATH = join(__dirname, '.state.json');
export const SERVICES_PATH = join(__dirname, 'services.json');

const IS_WIN = process.platform === 'win32';

/** Services whose ports phones/tablets should hit on the LAN. */
const LAN_SERVICE_IDS = new Set(['web', 'api']);

/**
 * Primary non-internal IPv4 for LAN device access.
 * Prefers RFC1918 private ranges and skips common virtual adapters (WSL, Hyper-V, Docker).
 * @returns {string | null}
 */
export function getLanIPv4() {
  const ifaces = networkInterfaces();
  /** @type {{ address: string; score: number }[]} */
  const candidates = [];

  for (const [name, entries] of Object.entries(ifaces)) {
    if (!entries) continue;
    const lower = name.toLowerCase();
    // Virtual / container bridges are private but unreachable from phones on Wi‑Fi.
    if (
      /wsl|hyper-v|vethernet|docker|vbox|vmware|virtualbox|loopback|bluetooth|isatap|teredo/.test(
        lower,
      )
    ) {
      continue;
    }
    for (const entry of entries) {
      if (entry.internal || (entry.family !== 'IPv4' && entry.family !== 4)) continue;
      const address = entry.address;
      let score = 0;
      if (address.startsWith('192.168.')) score = 30;
      else if (address.startsWith('10.')) score = 20;
      else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) score = 10;
      else score = 1; // public / other — last resort
      // Prefer names that look like real NICs
      if (/wi-?fi|wlan|ethernet|eth|en0|en1|local area/.test(lower)) score += 5;
      candidates.push({ address, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? null;
}

/**
 * Build a LAN URL for a service openUrl / port, or null if no LAN IP.
 * @param {string | null} openUrl
 * @param {number | undefined} port
 * @param {string | null} lanIp
 */
function toLanUrl(openUrl, port, lanIp) {
  if (!lanIp) return null;
  if (openUrl) {
    try {
      const u = new URL(openUrl);
      u.hostname = lanIp;
      return u.href;
    } catch {
      /* fall through */
    }
  }
  if (port != null) return `http://${lanIp}:${port}`;
  return null;
}

/** @type {Map<string, 'starting' | 'stopping'>} */
const transitions = new Map();

/** @type {Map<string, import('node:child_process').ChildProcess>} */
const children = new Map();

export function loadServices() {
  return JSON.parse(readFileSync(SERVICES_PATH, 'utf8'));
}

export function getService(id) {
  const svc = loadServices().find((s) => s.id === id);
  if (!svc) throw new Error(`Unknown service: ${id}`);
  return svc;
}

function ensureDirs() {
  mkdirSync(LOGS_DIR, { recursive: true });
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { pids: {} };
  }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

function setOwnedPid(id, pid) {
  const state = loadState();
  if (pid == null) delete state.pids[id];
  else state.pids[id] = pid;
  saveState(state);
}

function getOwnedPid(id) {
  return loadState().pids[id] ?? null;
}

function logPath(id) {
  return join(LOGS_DIR, `${id}.log`);
}

function appendLog(id, chunk) {
  ensureDirs();
  try {
    appendFileSync(logPath(id), chunk);
  } catch {
    // Windows may keep the shell-redirected log locked briefly after kill.
  }
}

export function readLogTail(id, lines = 80) {
  ensureDirs();
  const path = logPath(id);
  if (!existsSync(path)) return '';
  const text = readFileSync(path, 'utf8');
  const parts = text.split(/\r?\n/);
  return parts.slice(Math.max(0, parts.length - lines)).join('\n');
}

function probeTcp(port, hosts = ['127.0.0.1', '::1'], timeoutMs = 800) {
  const tryHost = (host) =>
    new Promise((resolve) => {
      const socket = createConnection({ port, host });
      const done = (ok) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });

  return (async () => {
    for (const host of hosts) {
      if (await tryHost(host)) return true;
    }
    return false;
  })();
}

async function probeHttp(url, timeoutMs = 1500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeHealth(svc) {
  const h = svc.health;
  if (!h) return false;
  if (h.type === 'tcp') return probeTcp(h.port);
  if (h.type === 'http') return probeHttp(h.url);
  return false;
}

async function runDocker(args) {
  try {
    const { stdout, stderr } = await execFileAsync('docker', args, {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout?.trim() ?? '', stderr: stderr?.trim() ?? '' };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.toString?.()?.trim?.() ?? '',
      stderr: err.stderr?.toString?.()?.trim?.() ?? err.message,
      code: err.code,
    };
  }
}

async function dockerExists(name) {
  const r = await runDocker(['inspect', '-f', '{{.State.Status}}', name]);
  if (!r.ok) return { exists: false, status: null };
  return { exists: true, status: r.stdout };
}

async function dockerStart(svc) {
  const name = svc.containerName;
  const info = await dockerExists(name);
  if (info.exists) {
    if (info.status === 'running') return { ok: true, message: 'already running' };
    const r = await runDocker(['start', name]);
    if (!r.ok) throw new Error(r.stderr || `docker start ${name} failed`);
    return { ok: true, message: 'started existing container' };
  }
  const r = await runDocker(['run', ...svc.dockerRunArgs]);
  if (!r.ok) throw new Error(r.stderr || `docker run ${name} failed`);
  return { ok: true, message: 'created and started container' };
}

async function dockerStop(svc) {
  const name = svc.containerName;
  const info = await dockerExists(name);
  if (info.exists) {
    if (info.status !== 'running') return { ok: true, message: 'already stopped' };
    const r = await runDocker(['stop', name]);
    if (!r.ok) throw new Error(r.stderr || `docker stop ${name} failed`);
    return { ok: true, message: 'stopped' };
  }

  // Legacy / unnamed container still bound to the service port
  if (await probeHealth(svc)) {
    const listed = await runDocker([
      'ps',
      '--filter',
      `publish=${svc.port}`,
      '--format',
      '{{.ID}}',
    ]);
    const id = listed.stdout.split(/\s+/)[0];
    if (id) {
      const r = await runDocker(['stop', id]);
      if (!r.ok) throw new Error(r.stderr || `docker stop ${id} failed`);
      return { ok: true, message: `stopped unnamed container ${id}` };
    }
  }

  return { ok: true, message: 'container not found' };
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function findPidOnPort(port) {
  if (IS_WIN) {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`,
        ],
        { encoding: 'utf8' },
      );
      const pid = Number(stdout.trim());
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  }
  try {
    const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
    const pid = Number(stdout.trim().split(/\s+/)[0]);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function killProcessTree(pid) {
  if (!pid) return;
  if (IS_WIN) {
    await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F']).catch(() => {});
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => setTimeout(r, 400));
  if (isPidAlive(pid)) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
}

function spawnNpmScript(svc) {
  ensureDirs();
  const outPath = logPath(svc.id);
  const stamp = `\n===== start ${new Date().toISOString()} (${svc.npmScript}) =====\n`;
  appendFileSync(outPath, stamp);

  // Redirect via the shell (no inherited pipes) so callers never wait on Vite/SAM output.
  // detached must stay OFF on Windows: DETACHED_PROCESS strips the console and cmd's
  // >> redirection silently writes nothing. Unix keeps detached for process-group kill.
  const quotedLog = `"${outPath.replace(/"/g, '')}"`;
  const command = IS_WIN
    ? `npm.cmd run ${svc.npmScript} >> ${quotedLog} 2>&1`
    : `npm run ${svc.npmScript} >> ${quotedLog} 2>&1`;
  const child = spawn(command, {
    cwd: REPO_ROOT,
    shell: true,
    // PYTHONUNBUFFERED keeps SAM CLI (Python) output streaming into the log
    // instead of buffering until exit.
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: 'ignore',
    detached: !IS_WIN,
    windowsHide: true,
  });

  children.set(svc.id, child);
  if (child.pid) setOwnedPid(svc.id, child.pid);
  child.unref();

  child.on('exit', (code, signal) => {
    children.delete(svc.id);
    appendLog(svc.id, `\n===== exit code=${code} signal=${signal} ${new Date().toISOString()} =====\n`);
    const owned = getOwnedPid(svc.id);
    if (owned === child.pid) setOwnedPid(svc.id, null);
  });

  child.on('error', (err) => {
    appendLog(svc.id, `\n===== spawn error: ${err.message} =====\n`);
  });

  return child;
}

async function processStart(svc) {
  if (await probeHealth(svc)) {
    return { ok: true, message: 'already healthy on port' };
  }
  const owned = getOwnedPid(svc.id);
  if (owned && isPidAlive(owned) && children.has(svc.id)) {
    return { ok: true, message: 'already starting/running (owned)' };
  }
  spawnNpmScript(svc);
  return { ok: true, message: `spawned npm run ${svc.npmScript}` };
}

async function processStop(svc) {
  let pid = getOwnedPid(svc.id);
  const child = children.get(svc.id);
  if (child?.pid) pid = child.pid;

  if (!pid || !isPidAlive(pid)) {
    pid = await findPidOnPort(svc.port);
  }

  if (!pid) {
    setOwnedPid(svc.id, null);
    children.delete(svc.id);
    return { ok: true, message: 'not running' };
  }

  await killProcessTree(pid);
  setOwnedPid(svc.id, null);
  children.delete(svc.id);
  return { ok: true, message: `killed pid ${pid}` };
}

export async function getServiceStatus(svc, lanIp = getLanIPv4()) {
  const transition = transitions.get(svc.id) ?? null;
  const healthy = await probeHealth(svc);

  let ownedPid = getOwnedPid(svc.id);
  if (ownedPid && !isPidAlive(ownedPid)) {
    setOwnedPid(svc.id, null);
    ownedPid = null;
  }

  let containerStatus = null;
  if (svc.kind === 'docker') {
    const info = await dockerExists(svc.containerName);
    containerStatus = info.exists ? info.status : 'absent';
  }

  let status = 'stopped';
  if (transition === 'starting') status = 'starting';
  else if (transition === 'stopping') status = 'stopping';
  else if (healthy) status = 'running';
  else if (svc.kind === 'docker' && containerStatus === 'running') status = 'unhealthy';
  else if (svc.kind === 'process' && ownedPid && isPidAlive(ownedPid)) status = 'starting';
  else status = 'stopped';

  const canStop =
    svc.kind === 'docker'
      ? containerStatus === 'running' || healthy
      : Boolean(ownedPid) || healthy;

  const openUrl = svc.openUrl ?? null;
  const lanUrl = LAN_SERVICE_IDS.has(svc.id) ? toLanUrl(openUrl, svc.port, lanIp) : null;

  return {
    id: svc.id,
    name: svc.name,
    kind: svc.kind,
    port: svc.port,
    openUrl,
    lanUrl,
    status,
    healthy,
    ownedPid,
    containerStatus,
    canStop,
    transition,
  };
}

export async function listStatuses() {
  const lanIp = getLanIPv4();
  const services = loadServices();
  const list = await Promise.all(services.map((s) => getServiceStatus(s, lanIp)));
  return { lanIp, services: list };
}

async function waitFor(predicate, { timeoutMs = 120_000, intervalMs = 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export async function startService(id) {
  const svc = getService(id);
  if (transitions.get(id)) throw new Error(`Busy: ${transitions.get(id)}`);
  transitions.set(id, 'starting');
  try {
    if (svc.kind === 'docker') {
      const result = await dockerStart(svc);
      await waitFor(() => probeHealth(svc), { timeoutMs: 30_000, intervalMs: 500 });
      return result;
    }
    const result = await processStart(svc);
    // API build can take a while; web is faster
    const timeoutMs = svc.id === 'api' ? 180_000 : 60_000;
    await waitFor(() => probeHealth(svc), { timeoutMs, intervalMs: 1000 });
    return result;
  } finally {
    transitions.delete(id);
  }
}

export async function stopService(id) {
  const svc = getService(id);
  if (transitions.get(id)) throw new Error(`Busy: ${transitions.get(id)}`);
  transitions.set(id, 'stopping');
  try {
    if (svc.kind === 'docker') {
      const result = await dockerStop(svc);
      await waitFor(async () => !(await probeHealth(svc)), { timeoutMs: 20_000, intervalMs: 400 });
      return result;
    }
    const result = await processStop(svc);
    await waitFor(async () => !(await probeHealth(svc)), { timeoutMs: 20_000, intervalMs: 400 });
    return result;
  } finally {
    transitions.delete(id);
  }
}

export async function restartService(id) {
  await stopService(id).catch(() => {});
  return startService(id);
}

/** Stack order: infra first, then api, then web. Stop reverses. */
export function stackOrder(direction = 'start') {
  const ids = ['dynamodb', 'minio', 'api', 'web'];
  return direction === 'stop' ? [...ids].reverse() : ids;
}

export async function startStack() {
  const results = [];
  for (const id of stackOrder('start')) {
    try {
      const r = await startService(id);
      results.push({ id, ok: true, ...r });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
      break;
    }
  }
  return results;
}

export async function stopStack() {
  const results = [];
  for (const id of stackOrder('stop')) {
    try {
      const r = await stopService(id);
      results.push({ id, ok: true, ...r });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  return results;
}
